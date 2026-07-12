import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authRepository } from "./auth.repository.js";
import { authEvents } from "./auth.events.js";
import { IRegisterInput, IAuthResponse, IUserResponseDTO, IDeviceInfo } from "./auth.interface.js";
import { AppError } from "../../utils/appError.js";
import { env } from "../../config/env.js";
import { getRedisClient } from "../../config/redis.js";
import { AUTH_CONSTANTS } from "./auth.constants.js";
import { sendMail } from "../../utils/sendMail.js";
import { getWelcomeEmailTemplate } from "./auth.template.js";

export class AuthService {
  public async register(input: IRegisterInput, deviceInfo: IDeviceInfo = {}): Promise<IAuthResponse> {
    // 1. Check for duplicate registration
    const existingUser = await authRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError("Email is already registered", 409);
    }

    // 2. Create user via repository
    const newUser = await authRepository.create(input);

    // 3. Prepare User Response DTO
    const userDto: IUserResponseDTO = {
      id: newUser._id.toString(),
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
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

    // 5. Save device session in Redis under USER_DEVICES array key with 7-day TTL
    try {
      const redis = getRedisClient();
      const devicesKey = AUTH_CONSTANTS.REDIS.CACHE_KEYS.USER_DEVICES(userDto.id);

      const deviceSession = {
        deviceId,
        refreshToken,
        userAgent: deviceInfo.userAgent || "unknown",
        ip: deviceInfo.ip || "unknown",
        createdAt: new Date().toISOString(),
      };

      await redis.set(devicesKey, JSON.stringify([deviceSession]), {
        EX: AUTH_CONSTANTS.REDIS.TTL.USER_DEVICES,
      });
      console.log(`Saved device session to Redis under user devices key: ${devicesKey}`);
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

  public async sendWelcomeEmail(user: IUserResponseDTO): Promise<void> {
    console.log(`Triggering welcome email to: ${user.email}`);
    try {
      const htmlContent = getWelcomeEmailTemplate(user.firstName, user.lastName);
      await sendMail({
        email: user.email,
        subject: "Welcome to Social Media App!",
        message: `Hello ${user.firstName} ${user.lastName},\n\nThank you for registering on our platform! We are thrilled to have you here.\n\nBest Regards,\nThe Team`,
        html: htmlContent,
      });
      console.log(`Welcome email sent successfully to: ${user.email}`);
    } catch (error) {
      console.error(`Failed to send welcome email to ${user.email}:`, error);
    }
  }
}

export const authService = new AuthService();
export default authService;
