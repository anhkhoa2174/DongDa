import { ConfigProvider, theme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import type { PropsWithChildren } from 'react';

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#f5b301',
          colorInfo: '#111827',
          colorText: '#111827',
          colorBgLayout: '#ffffff',
          colorBorder: '#e5e7eb',
          colorFillSecondary: '#faf7ed',
          borderRadius: 8,
          boxShadowTertiary: '0 10px 30px rgba(17, 24, 39, 0.08)',
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Button: {
            primaryColor: '#111827',
            borderRadius: 8,
            controlHeight: 38,
            controlHeightLG: 44,
          },
          Card: {
            borderRadiusLG: 10,
            headerBg: '#ffffff',
            colorBorderSecondary: '#e5e7eb',
            bodyPadding: 20,
            headerHeight: 50,
          },
          Form: {
            labelColor: '#374151',
            labelFontSize: 13,
            itemMarginBottom: 16,
            verticalLabelPadding: '0 0 5px',
          },
          Input: {
            borderRadius: 8,
          },
          InputNumber: {
            borderRadius: 8,
          },
          Layout: {
            bodyBg: '#ffffff',
            headerBg: '#ffffff',
            siderBg: '#0b0b0b',
          },
          Menu: {
            darkItemBg: '#0b0b0b',
            darkSubMenuItemBg: '#171717',
            darkItemColor: '#f5b301',
            darkItemHoverColor: '#f5b301',
            darkItemSelectedBg: '#f5b301',
            darkItemSelectedColor: '#111827',
          },
          Select: {
            borderRadius: 8,
          },
          Table: {
            headerBg: '#fafafa',
            headerColor: '#374151',
            rowHoverBg: '#fff8db',
            cellPaddingBlock: 11,
            cellPaddingInline: 12,
            cellPaddingBlockSM: 8,
            cellPaddingInlineSM: 10,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
