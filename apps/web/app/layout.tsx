import type {
  Metadata,
} from 'next';

import type {
  ReactNode,
} from 'react';

import './globals.css';

export const metadata:
  Metadata = {
  title:
    'Bếp Nhớ',

  description:
    'Trợ lý nấu ăn Việt cá nhân hóa theo khẩu vị, có trí nhớ.',
};

export default function RootLayout(
  {
    children,
  }: {
    children:
      ReactNode;
  },
) {
  return (
    <html lang="vi">
      <body>
        {children}
      </body>
    </html>
  );
}
