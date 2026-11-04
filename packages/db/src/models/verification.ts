import { schema, types, VALIDATION_LEVEL } from "papr";

import { papr } from "../papr.ts";

export const verificationSchema = schema(
  {
    createdAt: types.date({ required: true }),
    expiresAt: types.date({ required: true }),
    identifier: types.string({ required: true }),
    updatedAt: types.date({ required: true }),
    value: types.string({ required: true }),
  },
  { validationLevel: VALIDATION_LEVEL.OFF }
);

export type VerificationDocument = (typeof verificationSchema)[0];

export const Verification = papr.model("verification", verificationSchema);
