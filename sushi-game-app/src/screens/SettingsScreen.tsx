import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ScrollView, Linking } from 'react-native';
import { SegmentedButtons, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useColorScheme } from '../theme/ThemeProvider';
import SoundManager from '../utils/SoundManager';
import { haptics } from '../utils/haptics';
import useGameStore from '../store/gameStore';
import { isCrashReportingEnabled, setCrashReportingEnabled } from '../services/crashReporter';
import { preferences, ThemePreference } from '../services/preferences';
import { APP_VARIANT, APP_VERSION, PRIVACY_POLICY_URL } from '../config';
import { logger } from '../utils/logger';
import { useExclusiveModal } from '../hooks/useExclusiveModal';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import InviteSheet from '../components/InviteSheet';
import ConfirmSheet, { ConfirmOptions } from '../components/ui/ConfirmSheet';
import Panel from '../components/ui/Panel';
import ScreenHeader from '../components/ui/ScreenHeader';
import SectionTitle from '../components/ui/SectionTitle';

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

// Interruttore nello stile dell'app per le righe delle impostazioni
const SettingSwitch: React.FC<{ value: boolean; onChange: () => void; label: string }> = ({
  value,
  onChange,
  label,
}) => {
  const { colors } = useAppTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      thumbColor={value ? colors.primary : colors.surface}
      trackColor={{ false: colors.outline, true: colors.primaryContainer }}
      ios_backgroundColor={colors.outline}
    />
  );
};

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useColorScheme();
  const [soundEnabled, setSoundEnabled] = useState(SoundManager.isSoundEnabled());
  const [hapticsEnabled, setHapticsEnabled] = useState(haptics.isEnabled());
  const [crashReports, setCrashReports] = useState(isCrashReportingEnabled());
  const { modal, openModal, closeModal } = useExclusiveModal<'share' | 'confirm'>();
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
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
  // Con una partita in corso la cancellazione dei dati non impedisce di rientrarvi
  const gameInProgress = !!sessionId && !gameEnded;

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (error) {
      logger.warn('Apertura informativa privacy non riuscita', error);
      setSnackbar('Impossibile aprire la pagina');
    }
  };

  const clearLocalData = async () => {
    try {
      await preferences.clearAllLocalData({ keepActiveSession: gameInProgress });
      setPreference('system');
      SoundManager.setSoundEnabled(true);
      setSoundEnabled(true);
      haptics.setEnabled(true);
      setHapticsEnabled(true);
      // Anche il consenso alle segnalazioni di errore torna al valore iniziale (disattivate)
      setCrashReportingEnabled(false);
      setCrashReports(false);
      setSnackbar('Dati locali cancellati');
    } catch (error) {
      logger.error('Cancellazione dati locali non riuscita', error);
      setSnackbar('Impossibile cancellare i dati');
    }
  };

  const confirmClearLocalData = () => {
    setDialog({
      seal: '消',
      title: 'Cancellare i dati locali?',
      message: gameInProgress
        ? "Verranno eliminati da questo dispositivo lo storico delle partite, il nome salvato e le preferenze, compreso il consenso alle segnalazioni di errore. La partita in corso resta disponibile per rientrare. L'operazione non si può annullare."
        : "Verranno eliminati da questo dispositivo lo storico delle partite, il nome salvato e le preferenze, compreso il consenso alle segnalazioni di errore. L'operazione non si può annullare.",
      confirmLabel: 'Cancella i dati',
      confirmIcon: 'delete-outline',
      destructive: true,
      cancelLabel: 'Annulla',
      onConfirm: clearLocalData,
    });
    openModal('confirm');
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    SoundManager.setSoundEnabled(newState);
  };

  const toggleHaptics = () => {
    const newState = !hapticsEnabled;
    setHapticsEnabled(newState);
    haptics.setEnabled(newState);
    if (newState) haptics.piece();
  };

  const toggleCrashReports = () => {
    const newState = !crashReports;
    setCrashReports(newState);
    setCrashReportingEnabled(newState);
    setSnackbar(newState ? 'Segnalazioni di errore attivate. Grazie!' : 'Segnalazioni di errore disattivate');
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

          <SectionTitle label="Audio e vibrazione" kanji="音" />
          <Panel style={[styles.panel, styles.listPanel]}>
            <SettingRow
              icon={soundEnabled ? 'volume-high' : 'volume-off'}
              title="Suoni"
              subtitle="Effetti quando aggiungi un pezzo e a fine partita"
              onPress={toggleSound}
              right={<SettingSwitch value={soundEnabled} onChange={toggleSound} label="Suoni" />}
            />
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <SettingRow
              icon={hapticsEnabled ? 'vibrate' : 'vibrate-off'}
              title="Vibrazione"
              subtitle="Leggera, quando aggiungi o annulli un pezzo e quando vinci"
              onPress={toggleHaptics}
              right={<SettingSwitch value={hapticsEnabled} onChange={toggleHaptics} label="Vibrazione" />}
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
                  onPress={() => openModal('share')}
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
              icon="bug-outline"
              title="Segnalazioni di errore"
              subtitle="Se qualcosa va storto invia al nostro server versione, sistema ed errore, mai nomi o partite"
              onPress={toggleCrashReports}
              right={
                <SettingSwitch value={crashReports} onChange={toggleCrashReports} label="Segnalazioni di errore" />
              }
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

      {sessionId ? (
        <InviteSheet
          visible={modal === 'share'}
          onClose={closeModal}
          sessionId={sessionId}
          sessionName={sessionName || sessionId}
          onResult={setSnackbar}
        />
      ) : null}

      <ConfirmSheet options={modal === 'confirm' ? dialog : null} onClose={closeModal} />

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
});

export default SettingsScreen;
