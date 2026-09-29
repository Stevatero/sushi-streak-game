import React from 'react';
import { act, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { ThemeProvider } from '../theme/ThemeProvider';

// Render con i provider globali dell'app (tema e componenti Paper).
// ThemeProvider carica la preferenza del tema in modo asincrono: il render attende il caricamento
// dentro act, così gli aggiornamenti di stato non generano avvisi "not wrapped in act(...)".
export async function renderWithProviders(ui: React.ReactElement) {
  const result = render(
    <ThemeProvider>
      <PaperProvider>{ui}</PaperProvider>
    </ThemeProvider>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return result;
}
