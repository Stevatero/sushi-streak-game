import { configureFonts, MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';
import type { TextStyle } from 'react-native';

/**
 * Design system di Sushi Streak.
 *
 * Palette ispirata ai colori tradizionali giapponesi e armonizzata con l'icona dell'app:
 * carta washi e seta grezza (kinari) per le superfici chiare, inchiostro sumi per il testo,
 * vermiglione shu (il colore dei timbri hanko e dei torii) come colore principale, indaco ai
 * e matcha come accenti. Il tema scuro "yoru" (notte) riprende il prugna dello splash screen.
 */

export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  black: 'Outfit_800ExtraBold',
} as const;

export const radii = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

// Stili di testo condivisi (il colore dipende dal tema e va aggiunto dove si usano)
export const typography = {
  display: { fontFamily: fonts.black, fontSize: 34, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.2 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 17 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  label: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  // I kanji decorativi usano il font di sistema (Noto CJK su Android)
  kanji: { fontSize: 12, letterSpacing: 2 },
} satisfies Record<string, TextStyle>;

const paperFonts = configureFonts({
  config: {
    displayLarge: { fontFamily: fonts.black, fontWeight: 'normal' },
    displayMedium: { fontFamily: fonts.black, fontWeight: 'normal' },
    displaySmall: { fontFamily: fonts.bold, fontWeight: 'normal' },
    headlineLarge: { fontFamily: fonts.bold, fontWeight: 'normal' },
    headlineMedium: { fontFamily: fonts.bold, fontWeight: 'normal' },
    headlineSmall: { fontFamily: fonts.bold, fontWeight: 'normal' },
    titleLarge: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    titleMedium: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    titleSmall: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    labelLarge: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    labelMedium: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    labelSmall: { fontFamily: fonts.semibold, fontWeight: 'normal' },
    bodyLarge: { fontFamily: fonts.regular, fontWeight: 'normal' },
    bodyMedium: { fontFamily: fonts.regular, fontWeight: 'normal' },
    bodySmall: { fontFamily: fonts.regular, fontWeight: 'normal' },
  },
});

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 4,
  fonts: paperFonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#C94330', // shu, vermiglione
    onPrimary: '#FFFFFF',
    primaryContainer: '#FBE0D8',
    onPrimaryContainer: '#5A170B',
    secondary: '#2F4B6E', // ai, indaco
    onSecondary: '#FFFFFF',
    secondaryContainer: '#DCE5F1',
    onSecondaryContainer: '#122338',
    tertiary: '#5F7F2E', // matcha
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#E2EBCF',
    onTertiaryContainer: '#1F2B0C',
    error: '#B3261E',
    onError: '#FFFFFF',
    errorContainer: '#F9DEDC',
    onErrorContainer: '#410E0B',
    background: '#F7F2EA', // washi
    onBackground: '#1D1A17', // sumi
    surface: '#FFFCF7', // kinari
    onSurface: '#1D1A17',
    surfaceVariant: '#EFE7DB',
    onSurfaceVariant: '#6B625A',
    outline: '#CFC4B5',
    outlineVariant: '#E6DDD0',
    inverseSurface: '#332F2B',
    inverseOnSurface: '#F5EFE7',
    inversePrimary: '#FF8A73',
    shadow: '#3B2A1E',
    scrim: '#000000',
    backdrop: 'rgba(29, 26, 23, 0.45)',
    surfaceDisabled: 'rgba(29, 26, 23, 0.12)',
    onSurfaceDisabled: 'rgba(29, 26, 23, 0.38)',
    elevation: {
      level0: 'transparent',
      level1: '#FBF6EF',
      level2: '#F8F1E8',
      level3: '#F5ECE1',
      level4: '#F3EADF',
      level5: '#F1E7DA',
    },
    // Colori aggiuntivi dell'app
    accent: '#F07A68', // salmone, come nell'icona
    gold: '#B98B2C',
    silver: '#8C96A1',
    bronze: '#A96B3F',
    sakura: '#F4B8C5',
    pattern: 'rgba(47, 75, 110, 0.07)', // onde seigaiha
    glass: 'rgba(255, 252, 247, 0.9)',
  },
};

export type AppTheme = typeof lightTheme;

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  roundness: 4,
  fonts: paperFonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#FF8A73',
    onPrimary: '#3A0C04',
    primaryContainer: '#6B2417',
    onPrimaryContainer: '#FFDAD2',
    secondary: '#A9C0E0',
    onSecondary: '#102338',
    secondaryContainer: '#2B3F5A',
    onSecondaryContainer: '#D8E4F6',
    tertiary: '#B5CC8A',
    onTertiary: '#1F2B0C',
    tertiaryContainer: '#3A4A1E',
    onTertiaryContainer: '#E0EDC5',
    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    background: '#16111B', // yoru, notte
    onBackground: '#F2ECE6',
    surface: '#211A27',
    onSurface: '#F2ECE6',
    surfaceVariant: '#2C2433',
    onSurfaceVariant: '#BDB2BF',
    outline: '#4A4052',
    outlineVariant: '#362E3D',
    inverseSurface: '#F2ECE6',
    inverseOnSurface: '#2A2230',
    inversePrimary: '#C94330',
    shadow: '#000000',
    scrim: '#000000',
    backdrop: 'rgba(8, 5, 10, 0.6)',
    surfaceDisabled: 'rgba(242, 236, 230, 0.12)',
    onSurfaceDisabled: 'rgba(242, 236, 230, 0.38)',
    elevation: {
      level0: 'transparent',
      level1: '#251D2B',
      level2: '#29212F',
      level3: '#2D2434',
      level4: '#2F2636',
      level5: '#332939',
    },
    accent: '#F59A8A',
    gold: '#E3C170',
    silver: '#C3CAD2',
    bronze: '#D39A6E',
    sakura: '#E8A3B4',
    pattern: 'rgba(169, 192, 224, 0.06)',
    glass: 'rgba(33, 26, 39, 0.88)',
  },
};

// Tema tipizzato con i colori aggiuntivi dell'app
export const useAppTheme = () => useTheme<AppTheme>();
