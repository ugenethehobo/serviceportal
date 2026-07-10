import type { AppearanceOptions } from '@stripe/connect-js'

export function getStripeConnectAppearance(isDark: boolean): AppearanceOptions {
  if (isDark) {
    return {
      overlays: 'drawer',
      variables: {
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSizeBase: '14px',
        spacingUnit: '4px',
        borderRadius: '10px',
        colorPrimary: '#fafafa',
        colorBackground: '#09090b',
        colorText: '#fafafa',
        colorSecondaryText: '#a1a1aa',
        colorBorder: '#3f3f46',
        colorDanger: '#f87171',
        buttonPrimaryColorBackground: '#fafafa',
        buttonPrimaryColorBorder: '#fafafa',
        buttonPrimaryColorText: '#18181b',
        buttonSecondaryColorBackground: '#27272a',
        buttonSecondaryColorBorder: '#3f3f46',
        buttonSecondaryColorText: '#fafafa',
        formBackgroundColor: '#18181b',
        offsetBackgroundColor: '#18181b',
      },
    }
  }

  return {
    overlays: 'drawer',
    variables: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSizeBase: '14px',
      spacingUnit: '4px',
      borderRadius: '10px',
      colorPrimary: '#18181b',
      colorBackground: '#ffffff',
      colorText: '#18181b',
      colorSecondaryText: '#71717a',
      colorBorder: '#e4e4e7',
      colorDanger: '#dc2626',
      buttonPrimaryColorBackground: '#18181b',
      buttonPrimaryColorBorder: '#18181b',
      buttonPrimaryColorText: '#ffffff',
      buttonSecondaryColorBackground: '#f4f4f5',
      buttonSecondaryColorBorder: '#e4e4e7',
      buttonSecondaryColorText: '#18181b',
      formBackgroundColor: '#ffffff',
      offsetBackgroundColor: '#fafafa',
    },
  }
}

export const STRIPE_CONNECT_FONTS = [
  {
    cssSrc:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
] as const