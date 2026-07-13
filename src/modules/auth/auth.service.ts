import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { authRepository } from "./auth.repository.js";
import { authEvents } from "./auth.events.js";
import {
  IRegisterInput,
  ILoginInput,
  IAuthResponse,
  IUserResponseDTO,
  IDeviceInfo,
  IRefreshTokenInput,
  IRefreshTokenResponse
} from "./auth.interface.js";
import { AppError } from "../../utils/appError.js";
import { env } from "../../config/env.js";
import { getRedisClient } from "../../config/redis.js";
import { AUTH_CONSTANTS } from "./auth.constants.js";
import { sendMail } from "../../utils/sendMail.js";
import { getWelcomeEmailTemplate } from "./auth.template.js";

export class AuthService {
  public generateGravatarUrl(email: string): string {
    const cleanEmail = email.trim().toLowerCase();
    const hash = crypto.createHash("md5").update(cleanEmail).digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?d=robohash&s=200`;
  }

  public async register(input: IRegisterInput, deviceInfo: IDeviceInfo = {}): Promise<IAuthResponse> {
    // 1. Check for duplicate registration
    const existingUser = await authRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError("Email is already registered", 409);
    }

    const profilePictureUrl = this.generateGravatarUrl(input.email);
    const registerInputWithProfilePicture = {
      ...input,
      profilePicture: profilePictureUrl,
    };

    // 2. Create user via repository
    const newUser = await authRepository.create(registerInputWithProfilePicture);

    // 3. Prepare User Response DTO
    const userDto: IUserResponseDTO = {
      id: newUser._id.toString(),
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      profilePicture: newUser.profilePicture,
      createdAt: newUser.createdAt,
    };

    // Generate unique device ID
    const deviceId = crypto.randomUUID();

    // 4. Generate Access and Refresh JWT Tokens
    const accessToken = jwt.sign(
      { id: userDto.id, email: userDto.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { id: userDto.id, email: userDto.email },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    // 5. Save device session in Redis under USER_DATA Hash key with 7-day TTL
    try {
      const redis = getRedisClient();
      const userKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DATA(userDto.id);

      const deviceSession = {
        deviceId,
        refreshToken,
        userAgent: deviceInfo.userAgent || "unknown",
        ip: deviceInfo.ip || "unknown",
        createdAt: new Date().toISOString(),
      };

      // Atomic HSET: Set user profile and this specific device session field
      await redis.hSet(userKey, {
        profile: JSON.stringify(userDto),
        [`session:${deviceId}`]: JSON.stringify(deviceSession),
      });

      // Set key TTL to 7 days
      await redis.expire(userKey, AUTH_CONSTANTS.REDIS.TTL.USER_DATA);
      console.log(`Saved user profile and device session to Redis under key: ${userKey}`);
    } catch (redisError) {
      console.warn("Failed to save device session in Redis:", redisError);
    }

    // 6. Dispatch asynchronous Kafka event
    await authEvents.emitUserRegistered(userDto);

    return {
      accessToken,
      refreshToken,
      deviceId,
      user: userDto,
    };
  }

  public async login(input: ILoginInput, deviceInfo: IDeviceInfo = {}): Promise<IAuthResponse> {
    // 1. Fetch user by email including the password field (due to select: false)
    const user = await authRepository.findByEmailWithPassword(input.email);
    if (!user || !user.password) {
      throw new AppError("Invalid email or password", 401);
    }

    // 2. Verify password
    const isPasswordMatch = await bcrypt.compare(input.password || "", user.password);
    if (!isPasswordMatch) {
      throw new AppError("Invalid email or password", 401);
    }

    // 3. Prepare User Response DTO
    const userDto: IUserResponseDTO = {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePicture: user.profilePicture,
      createdAt: user.createdAt,
    };

    // Generate unique device ID
    const deviceId = crypto.randomUUID();

    // 4. Generate Access and Refresh JWT Tokens
    const accessToken = jwt.sign(
      { id: userDto.id, email: userDto.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { id: userDto.id, email: userDto.email },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    // 5. Save device session in Redis under USER_DATA Hash key with 7-day TTL
    try {
      const redis = getRedisClient();
      const userKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DATA(userDto.id);

      const deviceSession = {
        deviceId,
        refreshToken,
        userAgent: deviceInfo.userAgent || "unknown",
        ip: deviceInfo.ip || "unknown",
        createdAt: new Date().toISOString(),
      };

      // Atomic HSET: Set user profile and this specific device session field
      await redis.hSet(userKey, {
        profile: JSON.stringify(userDto),
        [`session:${deviceId}`]: JSON.stringify(deviceSession),
      });

      // Set key TTL to 7 days
      await redis.expire(userKey, AUTH_CONSTANTS.REDIS.TTL.USER_DATA);
      console.log(`Saved user profile and device session to Redis under key: ${userKey}`);
    } catch (redisError) {
      console.warn("Failed to save device session in Redis:", redisError);
    }

    return {
      accessToken,
      refreshToken,
      deviceId,
      user: userDto,
    };
  }

  public async sendWelcomeEmail(user: IUserResponseDTO): Promise<void> {
    console.log(`Triggering welcome email to: ${user.email}`);
    try {
      const htmlContent = getWelcomeEmailTemplate(user.firstName, user.lastName);
      await sendMail({
        email: user.email,
        subject: "Welcome to Buddy Script Social Media App!",
        message: `Hello ${user.firstName} ${user.lastName},\n\nThank you for registering on our platform! We are thrilled to have you here.\n\nBest Regards,\nThe Team`,
        html: htmlContent,
      });
      console.log(`Welcome email sent successfully to: ${user.email}`);
    } catch (error) {
      console.error(`Failed to send welcome email to ${user.email}:`, error);
    }
  }

  public async logout(userId: string, deviceId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const userKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DATA(userId);
      const sessionField = `session:${deviceId}`;

      // Atomic HDEL to log out the specific device
      await redis.hDel(userKey, sessionField);
      console.log(`Successfully logged out device: ${sessionField} for user: ${userId}`);
    } catch (redisError: any) {
      console.warn("Failed to log out device in Redis:", redisError);
      throw new AppError("Failed to log out device session", 500);
    }
  }

  public async refreshToken(input: IRefreshTokenInput, deviceInfo: IDeviceInfo = {}): Promise<IRefreshTokenResponse> {
    const { refreshToken: clientToken, deviceId } = input;

    // 1. Verify the client refresh token using JWT_REFRESH_SECRET
    let decoded: any;
    try {
      decoded = jwt.verify(clientToken, env.JWT_REFRESH_SECRET);
    } catch (err: any) {
      // Proactively clear the session from Redis if the token is invalid/expired
      try {
        const payload = jwt.decode(clientToken) as any;
        if (payload && payload.id) {
          const redis = getRedisClient();
          const userKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DATA(payload.id);
          await redis.hDel(userKey, `session:${deviceId}`);
          console.warn(`Removed session:${deviceId} for user:${payload.id} due to verification error.`);
        }
      } catch { }
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const userId = decoded.id;
    const email = decoded.email;

    // 2. Fetch session data from Redis using HGET
    const redis = getRedisClient();
    const userKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DATA(userId);
    const sessionField = `session:${deviceId}`;

    const sessionDataStr = await redis.hGet(userKey, sessionField);
    if (!sessionDataStr) {
      throw new AppError("Session not found or expired", 401);
    }

    let sessionData: any;
    try {
      sessionData = JSON.parse(sessionDataStr);
    } catch {
      await redis.hDel(userKey, sessionField);
      throw new AppError("Session corrupted", 401);
    }

    // 3. Check if the provided refreshToken matches the one stored in Redis
    if (sessionData.refreshToken !== clientToken) {
      // Refresh token reuse or mismatch detected! Log out the device by removing the session.
      await redis.hDel(userKey, sessionField);
      console.warn(`Potential token theft: Refresh token mismatch detected for user: ${userId}, device: ${deviceId}. Session cleared.`);
      throw new AppError("Refresh token mismatch or potential reuse detected", 401);
    }

    // 4. Perform Refresh Token Rotation
    // Generate new access and refresh tokens
    const newAccessToken = jwt.sign(
      { id: userId, email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
    );

    const newRefreshToken = jwt.sign(
      { id: userId, email },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );

    // 5. Update the Redis Hash field
    const updatedSession = {
      ...sessionData,
      refreshToken: newRefreshToken,
      userAgent: deviceInfo.userAgent || sessionData.userAgent || "unknown",
      ip: deviceInfo.ip || sessionData.ip || "unknown",
      createdAt: new Date().toISOString(),
    };

    // Atomic multi transaction to update session and extend key TTL in one command
    await redis.multi()
      .hSet(userKey, sessionField, JSON.stringify(updatedSession))
      .expire(userKey, AUTH_CONSTANTS.REDIS.TTL.USER_DATA)
      .exec();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      deviceId,
    };
  }

  /**
   * Fetches multiple user profiles by their IDs in a single database batch query.
   */
  public async getUsersByIds(userIds: string[]): Promise<IUserResponseDTO[]> {
    const users = await authRepository.findByIds(userIds);
    return users.map((u) => ({
      id: u._id.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      profilePicture: u.profilePicture,
      createdAt: u.createdAt,
    }));
  }
}

export const authService = new AuthService();
export default authService;
