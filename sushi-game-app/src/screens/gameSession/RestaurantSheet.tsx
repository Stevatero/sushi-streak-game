import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RESTAURANT_NAME_MAX_LENGTH } from '../../config';
import { radii, typography, useAppTheme } from '../../theme/theme';
import AppButton from '../../components/ui/AppButton';
import Field from '../../components/ui/Field';
import Sheet from '../../components/ui/Sheet';

interface RestaurantSheetProps {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  sessionName: string;
  dateLabel: string;
  winnerText: string;
}

// Nome del ristorante da salvare con la partita nello storico
const RestaurantSheet: React.FC<RestaurantSheetProps> = ({
  visible,
  onClose,
  value,
  onChange,
  onSave,
  sessionName,
  dateLabel,
  winnerText,
}) => {
  const { colors } = useAppTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Dove avete mangiato?" kanji="店">
      <Field
        label="Nome del ristorante"
        placeholder="Es. Sushi Zen, Sakura…"
        value={value}
        onChangeText={onChange}
        maxLength={RESTAURANT_NAME_MAX_LENGTH}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSave}
      />
      <View style={[styles.info, { backgroundColor: colors.surfaceVariant }]}>
        <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>Sessione: {sessionName}</Text>
        <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>Data: {dateLabel}</Text>
        <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{winnerText}</Text>
      </View>
      <View style={styles.buttons}>
        <AppButton label="Annulla" variant="ghost" onPress={onClose} style={styles.flex} />
        <AppButton label="Salva" icon="check" onPress={onSave} style={styles.flex} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  info: {
    borderRadius: radii.md,
    padding: 14,
    gap: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
});

export default RestaurantSheet;
