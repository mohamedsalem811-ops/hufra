// Request validation. The shapes come from @hufra/contracts (shared with the
// mobile app and admin panel); this file only adds SERVER policy on top.

import {
  changePasswordSchema as changePasswordShape,
  passwordSchema as passwordShape,
  registerSchema as registerShape,
} from '@hufra/contracts'
import { isKnownPublicPassword } from './password'

export {
  emailSchema,
  loginSchema,
  createPotholeSchema,
  updateStatusSchema,
  listPotholesQuerySchema as listQuerySchema,
  regionInputSchema as regionSchema,
  donorInputSchema as donorSchema,
  photoMetaSchema,
  pushTokenSchema,
} from '@hufra/contracts'

/** Contract password shape + refusal of passwords that are publicly known. */
export const passwordSchema = passwordShape.refine((p) => !isKnownPublicPassword(p), {
  message: 'This password is publicly known; choose another one',
})

export const registerSchema = registerShape.extend({ password: passwordSchema })

export const changePasswordSchema = changePasswordShape.extend({ new_password: passwordSchema })
