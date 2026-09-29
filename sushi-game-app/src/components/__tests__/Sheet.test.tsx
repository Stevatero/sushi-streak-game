/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Keyboard, Modal, Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import Sheet from '../ui/Sheet';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('Sheet', () => {
  afterEach(() => jest.restoreAllMocks());

  const pressBack = () => act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());

  it('il tasto indietro chiude il pannello', async () => {
    const onClose = jest.fn();
    await renderWithProviders(
      <Sheet visible onClose={onClose} title="Ristorante">
        <Text>Contenuto</Text>
      </Sheet>
    );
    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('con la tastiera aperta il tasto indietro chiude solo la tastiera', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const onClose = jest.fn();
    await renderWithProviders(
      <Sheet visible onClose={onClose} title="Ristorante">
        <Text>Contenuto</Text>
      </Sheet>
    );
    pressBack();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
