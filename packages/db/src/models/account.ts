import { schema, types, VALIDATION_LEVEL } from "papr";

import { papr } from "../papr.ts";

export const accountSchema = schema(
  {
    accessToken: types.string(),
    accessTokenExpiresAt: types.date(),
    accountId: types.string({ required: true }),
    createdAt: types.date({ required: true }),
    idToken: types.string(),
    issuer: types.string(),
    password: types.string(),
    providerId: types.string({ required: true }),
    refreshToken: types.string(),
    refreshTokenExpiresAt: types.date(),
    scope: types.string(),
    updatedAt: types.date({ required: true }),
    userId: types.objectId({ required: true }),
  },
  { validationLevel: VALIDATION_LEVEL.OFF }
);

export type AccountDocument = (typeof accountSchema)[0];

export const Account = papr.model("account", accountSchema);
