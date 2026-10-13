import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { shareResultImage } from '../services/resultImage';
import AppButton from './ui/AppButton';
import Sheet from './ui/Sheet';
import ResultCard, { ResultCardProps } from './ResultCard';

interface ResultShareSheetProps {
  visible: boolean;
  onClose: () => void;
  result: Omit<ResultCardProps, 'width'> | null;
  // Esito da mostrare all'utente se la condivisione non riesce
  onError: (message: string) => void;
}

// Margini orizzontali del pannello (Sheet) attorno alla card
const SHEET_PADDING = 44;
const MAX_CARD_WIDTH = 360;

// Anteprima del risultato e condivisione come immagine (es. nel gruppo WhatsApp della cena)
const ResultShareSheet: React.FC<ResultShareSheetProps> = ({ visible, onClose, result, onError }) => {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(MAX_CARD_WIDTH, width - SHEET_PADDING);

  const share = async () => {
    setSharing(true);
    const outcome = await shareResultImage(cardRef);
    setSharing(false);
    if (outcome === 'unavailable') onError('Condivisione non disponibile su questo dispositivo');
    else if (outcome === 'error') onError("Impossibile creare l'immagine del risultato");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Condividi il risultato" kanji="共有">
      {result ? (
        <>
          <ScrollView style={styles.preview} showsVerticalScrollIndicator={false}>
            <ResultCard ref={cardRef} {...result} width={cardWidth} />
          </ScrollView>
          <View style={styles.buttons}>
            <AppButton label="Condividi immagine" icon="image-outline" onPress={share} loading={sharing} />
            <AppButton label="Chiudi" variant="ghost" onPress={onClose} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  preview: {
    flexShrink: 1,
  },
  buttons: {
    gap: 6,
    marginTop: 14,
  },
});

export default ResultShareSheet;
