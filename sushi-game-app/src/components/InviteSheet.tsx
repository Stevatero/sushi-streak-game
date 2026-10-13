import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { shareService } from '../services/shareService';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import AppButton from './ui/AppButton';
import QrCode from './ui/QrCode';
import Sheet from './ui/Sheet';

interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName: string;
  // Esito da mostrare all'utente (es. "Codice copiato"), dopo la chiusura del pannello
  onResult: (message: string) => void;
}

// Invito alla partita: codice QR da inquadrare al tavolo, link da condividere e codice da copiare
const InviteSheet: React.FC<InviteSheetProps> = ({ visible, onClose, sessionId, sessionName, onResult }) => {
  const { colors } = useAppTheme();
  const link = shareService.generateShareLink(sessionId);

  const shareLink = async () => {
    const result = await shareService.shareSession(sessionId, sessionName);
    onClose();
    if (result === 'error') onResult('Impossibile condividere la sessione');
  };

  const copyCode = async () => {
    const success = await shareService.copySessionCode(sessionId);
    onClose();
    onResult(success ? 'Codice sessione copiato!' : 'Impossibile copiare il codice');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Invita amici" kanji="招待">
      <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>
        Fai inquadrare il codice QR con la fotocamera, condividi il link oppure fai inserire il codice nella schermata
        iniziale.
      </Text>
      <View style={styles.qrRow}>
        <QrCode value={link} size={156} accessibilityLabel={`Codice QR per entrare nella partita ${sessionId}`} />
      </View>
      <View style={[styles.codeBox, { borderColor: colors.outline, backgroundColor: colors.surfaceVariant }]}>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>Codice</Text>
        <Text style={[styles.codeText, { color: colors.onSurface }]} selectable maxFontSizeMultiplier={1.3}>
          {sessionId}
        </Text>
      </View>
      <View style={styles.buttons}>
        <AppButton label="Condividi link" icon="share-variant" onPress={shareLink} />
        <AppButton label="Copia codice" icon="content-copy" variant="tonal" onPress={copyCode} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  qrRow: {
    alignItems: 'center',
    marginTop: 14,
  },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 14,
    gap: 2,
  },
  codeText: {
    fontFamily: fonts.black,
    fontSize: 26,
    letterSpacing: 4,
  },
  buttons: {
    gap: 10,
    marginTop: 14,
  },
});

export default InviteSheet;
