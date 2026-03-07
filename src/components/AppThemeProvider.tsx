"use client";

import { Theme } from "@radix-ui/themes";

export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <Theme
      appearance="dark"
      accentColor="cyan"
      grayColor="slate"
      radius="large"
      panelBackground="translucent"
      scaling="100%"
    >
      {children}
    </Theme>
  );
}
