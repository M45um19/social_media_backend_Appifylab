import { v7 as generateUuidV7 } from "uuid";

/**
 * Generates an RFC-compliant UUID v7 using the official uuid package.
 *
 * @returns A 36-character UUID v7 string
 */
export const uuidv7 = (): string => {
  return generateUuidV7();
};
