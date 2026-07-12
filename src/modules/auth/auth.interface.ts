import { Document } from "mongoose";

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document<string> {
  _id: string;
}

export interface IRegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}

export interface ILoginInput {
  email: string;
  password?: string;
}

export interface IUserResponseDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt?: Date;
}

export interface IDeviceInfo {
  userAgent?: string;
  ip?: string;
}

export interface IAuthResponse {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: IUserResponseDTO;
}

export interface IRefreshTokenInput {
  refreshToken: string;
  deviceId: string;
}

export interface IRefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}
