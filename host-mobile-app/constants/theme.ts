export const COLORS = {
  primary: '#312E81', // Deep Indigo (Rich, elegant, premium)
  primaryLight: '#E0E7FF', // Soft Indigo wash
  accent: '#D4AF37', // Champagne Gold (For buttons, highlights, VIP feel)
  background: '#FAFAFA', // Clean off-white
  card: '#FFFFFF',
  text: '#1E293B', // Slate 800 for stark readability
  textMuted: '#64748B', 
  input: '#F1F5F9', // Soft gray for borderless input fields
  danger: '#E11D48', // Rose red
  success: '#059669', // Emerald
  border: '#E2E8F0',
};

export const SHADOWS = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  screenPadding: 16, // ALL screens must use this for side margins
};

export const TYPOGRAPHY = {
  title: { fontSize: 24, fontWeight: '800' as const, color: COLORS.text },
  header: { fontSize: 18, fontWeight: '600' as const, color: COLORS.text },
  body: { fontSize: 14, color: COLORS.text },
  bodyMuted: { fontSize: 14, color: COLORS.textMuted },
  small: { fontSize: 12, color: COLORS.textMuted },
};

