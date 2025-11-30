import { z } from 'zod';
import { isValidHexColor, normalizeHexColor } from '../utils/color';

export const themeInfoSchema = z.object({
  theme_name: z
    .string()
    .trim()
    .min(1, 'Theme name is required.')
    .max(100, 'Theme name must be 100 characters or fewer.'),
  theme_description: z
    .string()
    .trim()
    .max(280, 'Description must be 280 characters or fewer.')
    .optional()
    .or(z.literal('')),
});

export const cssVariablesSchema = z
  .record(
    z.string(),
    z
      .string()
      .transform((value) => normalizeHexColor(value))
      .refine((value) => isValidHexColor(value), {
        message: 'Value must be a valid hex color, e.g. #1a1a1a',
      })
  )
  .refine((variables) => Object.keys(variables).length <= 200, {
    message: 'You can only define up to 200 CSS variables.',
  });

export type ThemeInfoInput = z.infer<typeof themeInfoSchema>;
export type CSSVariablesInput = z.infer<typeof cssVariablesSchema>;
