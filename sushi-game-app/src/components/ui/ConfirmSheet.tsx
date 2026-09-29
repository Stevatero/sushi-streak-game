import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radii, typography, useAppTheme } from '../../theme/theme';
import AppButton from './AppButton';
import Hanko from './Hanko';
import Seigaiha from './Seigaiha';
import Sheet from './Sheet';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface ConfirmOptions {
  title: string;
  message?: string;
  // Sigillo hanko in alto (un kanji) e didascalia giapponese sotto il titolo
  seal?: string;
  sealColor?: string;
  kanji?: string;
  // Contenuto aggiuntivo tra il messaggio e i pulsanti (es. un riepilogo)
  details?: React.ReactNode;
  confirmLabel: string;
  confirmIcon?: IconName;
  // Azione principale distruttiva (uscire, rimuovere, cancellare): pulsante e sigillo rossi
  destructive?: boolean;
  // Senza etichetta di annullamento la finestra è solo informativa, con un unico pulsante
  cancelLabel?: string;
  onConfirm?: () => void;
  // Chiusura senza conferma: "Annulla", tocco sullo sfondo o tasto indietro
  onCancel?: () => void;
  // false: lo sfondo non chiude la finestra (per gli avvisi che richiedono una scelta)
  dismissable?: boolean;
}

interface ConfirmSheetProps {
  // null: finestra chiusa
  options: ConfirmOptions | null;
  onClose: () => void;
}

// Finestra di conferma nello stile dell'app, al posto degli Alert di sistema (uguale su Android e iOS)
const ConfirmSheet: React.FC<ConfirmSheetProps> = ({ options, onClose }) => {
  const { colors } = useAppTheme();
  // Durante la dissolvenza di chiusura resta visibile l'ultimo contenuto mostrato
  const [shown, setShown] = useState(options);
  if (options && options !== shown) setShown(options);
  const content = options ?? shown;

  // Le azioni usano solo le opzioni correnti: a finestra in chiusura un secondo tocco non fa nulla
  const confirm = () => {
    if (!options) return;
    onClose();
    options.onConfirm?.();
  };
  const cancel = () => {
    if (!options) return;
    onClose();
    options.onCancel?.();
  };

  const destructive = !!content?.destructive;
  const sealColor = content?.sealColor ?? (destructive ? colors.error : colors.primary);

  return (
    <Sheet visible={!!options} onClose={cancel} dismissable={content?.dismissable ?? true}>
      {content ? (
        <View style={styles.body}>
          {content.seal ? (
            <View style={styles.sealBand}>
              <Seigaiha style={[styles.pattern, { backgroundColor: colors.surfaceVariant }]} fadeTo={colors.surface} />
              <Hanko
                label={content.seal}
                size={68}
                tilt={-6}
                color={sealColor}
                textColor={destructive ? colors.onError : colors.onPrimary}
              />
            </View>
          ) : null}
          <Text style={[typography.title, styles.center, { color: colors.onSurface }]} accessibilityRole="header">
            {content.title}
          </Text>
          {content.kanji ? (
            <Text style={[typography.kanji, styles.kanji, { color: sealColor }]} importantForAccessibility="no">
              {content.kanji}
            </Text>
          ) : null}
          {content.message ? (
            <Text style={[typography.body, styles.center, styles.message, { color: colors.onSurfaceVariant }]}>
              {content.message}
            </Text>
          ) : null}
          {content.details}
          <View style={styles.buttons}>
            <AppButton
              label={content.confirmLabel}
              icon={content.confirmIcon}
              variant={destructive ? 'destructive' : 'primary'}
              size="lg"
              onPress={confirm}
            />
            {content.cancelLabel ? <AppButton label={content.cancelLabel} variant="ghost" onPress={cancel} /> : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  body: {
    alignItems: 'stretch',
  },
  // Fascia con le onde seigaiha che sfumano nel pannello, con il sigillo al centro
  sealBand: {
    height: 104,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pattern: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
  },
  center: {
    textAlign: 'center',
  },
  kanji: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 13,
    letterSpacing: 4,
  },
  message: {
    marginTop: 10,
    paddingHorizontal: 8,
  },
  buttons: {
    gap: 6,
    marginTop: 22,
  },
});

export default ConfirmSheet;
