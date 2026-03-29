import { useColorScheme } from 'react-native';

// We are completely ignoring the broken Expo Colors file and returning safe strings
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: string
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } 
  
  // Safe default fallback so the app NEVER crashes trying to read an undefined object
  return theme === 'light' ? '#000000' : '#ffffff';
}