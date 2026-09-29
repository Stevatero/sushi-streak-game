/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import ConfirmSheet, { ConfirmOptions } from '../ui/ConfirmSheet';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const base: ConfirmOptions = {
  seal: '完',
  kanji: 'ごちそうさま',
  title: 'Hai finito?',
  message: 'Non potrai più aggiungere pezzi.',
  confirmLabel: 'Conferma',
  cancelLabel: 'Annulla',
};

describe('ConfirmSheet', () => {
  it('mostra titolo, messaggio e i due pulsanti', async () => {
    await renderWithProviders(<ConfirmSheet options={base} onClose={jest.fn()} />);
    expect(screen.getByText('Hai finito?')).toBeTruthy();
    expect(screen.getByText('Non potrai più aggiungere pezzi.')).toBeTruthy();
    expect(screen.getByText('ごちそうさま')).toBeTruthy();
    expect(screen.getByText('Conferma')).toBeTruthy();
    expect(screen.getByText('Annulla')).toBeTruthy();
  });

  it('chiude la finestra e poi esegue la conferma o l’annullamento', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const options = { ...base, onConfirm, onCancel };
    const { rerender } = await renderWithProviders(<ConfirmSheet options={options} onClose={onClose} />);

    fireEvent.press(screen.getByText('Conferma'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onConfirm.mock.invocationCallOrder[0]);

    fireEvent.press(screen.getByText('Annulla'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // A finestra in chiusura il contenuto resta visibile ma i pulsanti non fanno più nulla
    rerender(<ConfirmSheet options={null} onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('senza etichetta di annullamento è un avviso con un solo pulsante', async () => {
    await renderWithProviders(<ConfirmSheet options={{ ...base, cancelLabel: undefined }} onClose={jest.fn()} />);
    expect(screen.getByText('Conferma')).toBeTruthy();
    expect(screen.queryByText('Annulla')).toBeNull();
  });
});
