import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ScrollView, Alert, Linking } from 'react-native';
import { SegmentedButtons, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useColorScheme } from '../theme/ThemeProvider';
import SoundManager from '../utils/SoundManager';
import useGameStore from '../store/gameStore';
import { shareService } from '../services/shareService';
import { preferences, ThemePreference } from '../services/preferences';
import { APP_VARIANT, APP_VERSION, PRIVACY_POLICY_URL } from '../config';
import { logger } from '../utils/logger';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import AppButton from '../components/ui/AppButton';
import Panel from '../components/ui/Panel';
import ScreenHeader from '../components/ui/ScreenHeader';
import SectionTitle from '../components/ui/SectionTitle';
import Sheet from '../components/ui/Sheet';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface RowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const SettingRow: React.FC<RowProps> = ({ icon, title, subtitle, right, onPress, danger, disabled }) => {
  const { colors } = useAppTheme();
  const tint = danger ? colors.error : colors.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceVariant }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.errorContainer : colors.surfaceVariant }]}>
        <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.onErrorContainer : colors.onSurface} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: tint, opacity: disabled ? 0.5 : 1 }]}>{title}</Text>
        {subtitle ? <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.outline} /> : null)}
    </Pressable>
  );
};

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useColorScheme();
  const [soundEnabled, setSoundEnabled] = useState(SoundManager.isSoundEnabled());
  const [showShareModal, setShowShareModal] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const { sessionId, sessionName, gameEnded, status } = useGameStore(
    useShallow((s) => ({
      sessionId: s.sessionId,
      sessionName: s.sessionName,
      gameEnded: s.gameEnded,
      status: s.status,
    }))
  );

  // La condivisione è disponibile finché il server considera la sessione attiva
  const canShare = !!sessionId && !gameEnded && status === 'active';

  const copySessionCode = async () => {
    if (!sessionId) return;
    const success = await shareService.copySessionCode(sessionId);
    setShowShareModal(false);
    setSnackbar(success ? 'Codice sessione copiato!' : 'Impossibile copiare il codice');
  };

  const shareSessionLink = async () => {
    if (!sessionId || !sessionName) return;
    const result = await shareService.shareSession(sessionId, sessionName);
    setShowShareModal(false);
    if (result === 'error') setSnackbar('Impossibile condividere il link');
  };

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (error) {
      logger.warn('Apertura informativa privacy non riuscita', error);
      setSnackbar('Impossibile aprire la pagina');
    }
  };

  const confirmClearLocalData = () => {
    Alert.alert(
      'Cancellare i dati locali?',
      "Verranno eliminati da questo dispositivo lo storico delle partite, il nome salvato e le preferenze. L'operazione non si può annullare.",
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Cancella',
          style: 'destructive',
          onPress: async () => {
            try {
              await preferences.clearAllLocalData();
              setPreference('system');
              SoundManager.setSoundEnabled(true);
              setSoundEnabled(true);
              setSnackbar('Dati locali cancellati');
            } catch (error) {
              logger.error('Cancellazione dati locali non riuscita', error);
              setSnackbar('Impossibile cancellare i dati');
            }
          },
        },
      ]
    );
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    SoundManager.setSoundEnabled(newState);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 + insets.bottom }}>
        <ScreenHeader title="Impostazioni" kanji="設定" onBack={() => navigation.goBack()} backIcon="close" />

        <View style={styles.content}>
          <SectionTitle label="Aspetto" kanji="外観" />
          <Panel style={styles.panel}>
            <SegmentedButtons
              value={preference}
              onValueChange={(value) => setPreference(value as ThemePreference)}
              buttons={[
                { value: 'system', label: 'Sistema' },
                { value: 'light', label: 'Chiaro' },
                { value: 'dark', label: 'Scuro' },
              ]}
            />
          </Panel>

          <SectionTitle label="Audio" kanji="音" />
          <Panel style={[styles.panel, styles.listPanel]}>
            <SettingRow
              icon={soundEnabled ? 'volume-high' : 'volume-off'}
              title="Suoni"
              subtitle="Effetti quando aggiungi un pezzo e a fine partita"
              onPress={toggleSound}
              right={
                <Switch
                  value={soundEnabled}
                  onValueChange={toggleSound}
                  accessibilityLabel="Suoni"
                  thumbColor={soundEnabled ? colors.primary : colors.surface}
                  trackColor={{ false: colors.outline, true: colors.primaryContainer }}
                  ios_backgroundColor={colors.outline}
                />
              }
            />
          </Panel>

          {/* Condivisione sessione, solo se c'è una partita in corso */}
          {sessionId ? (
            <>
              <SectionTitle label="Sessione" kanji="対局" />
              <Panel style={[styles.panel, styles.listPanel]}>
                <SettingRow
                  icon="share-variant"
                  title={`Invita amici · ${sessionName || sessionId}`}
                  subtitle={
                    canShare ? `Codice ${sessionId}` : gameEnded ? 'Sessione terminata' : 'Condivisione non disponibile'
                  }
                  onPress={() => setShowShareModal(true)}
                  disabled={!canShare}
                />
              </Panel>
            </>
          ) : null}

          <SectionTitle label="Privacy" kanji="個人情報" />
          <Panel style={[styles.panel, styles.listPanel]}>
            <SettingRow
              icon="shield-account-outline"
              title="Informativa sulla privacy"
              subtitle="Nessun account, niente pubblicità o tracciamento"
              onPress={openPrivacyPolicy}
            />
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <SettingRow
              icon="delete-outline"
              title="Cancella dati locali"
              subtitle="Storico, nome salvato e preferenze"
              onPress={confirmClearLocalData}
              danger
            />
          </Panel>

          <SectionTitle label="Info" kanji="情報" />
          <Panel style={[styles.panel, styles.listPanel]}>
            <SettingRow
              icon="information-outline"
              title="Sushi Streak"
              subtitle={`Versione ${APP_VERSION}${APP_VARIANT !== 'production' ? ` (${APP_VARIANT})` : ''}`}
            />
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <SettingRow icon="account-heart-outline" title="Sviluppato da" subtitle="Dario Stevanato" />
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <SettingRow
              icon="code-tags"
              title="Open source"
              subtitle={`Licenza MIT · React Native, Expo, Socket.IO · © ${new Date().getFullYear()}`}
            />
          </Panel>
        </View>
      </ScrollView>

      <Sheet visible={showShareModal} onClose={() => setShowShareModal(false)} title="Invita amici" kanji="招待">
        <View style={[styles.codeBox, { borderColor: colors.outline, backgroundColor: colors.surfaceVariant }]}>
          <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>Codice</Text>
          <Text style={[styles.codeText, { color: colors.onSurface }]} selectable>
            {sessionId}
          </Text>
        </View>
        <View style={styles.sheetButtons}>
          <AppButton label="Condividi link" icon="share-variant" onPress={shareSessionLink} />
          <AppButton label="Copia codice" icon="content-copy" variant="tonal" onPress={copySessionCode} />
        </View>
      </Sheet>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  panel: {
    marginBottom: 22,
  },
  listPanel: {
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    alignItems: 'center',
    paddingVertical: 18,
    gap: 4,
  },
  codeText: {
    fontFamily: fonts.black,
    fontSize: 30,
    letterSpacing: 4,
  },
  sheetButtons: {
    gap: 10,
    marginTop: 16,
  },
});

export default SettingsScreen;
