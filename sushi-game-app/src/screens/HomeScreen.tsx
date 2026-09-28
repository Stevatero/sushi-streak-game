import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { shareService } from '../services/shareService';
import { SessionStorageService, ActiveSession } from '../services/sessionStorage';
import { api, ApiError } from '../services/api';
import { preferences } from '../services/preferences';
import { PLAYER_NAME_MAX_LENGTH, SESSION_CODE_MAX_LENGTH, SESSION_CODE_MIN_LENGTH } from '../config';
import { extractSessionCode, generateSessionCode, isValidSessionCode, sanitizeSessionCode } from '../utils/sessionCode';
import type { RootNavigationProp } from '../navigation/types';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import AppButton from '../components/ui/AppButton';
import Field from '../components/ui/Field';
import Hanko from '../components/ui/Hanko';
import Panel from '../components/ui/Panel';
import SectionTitle from '../components/ui/SectionTitle';
import Seigaiha from '../components/ui/Seigaiha';

type Mode = 'create' | 'join';
type PendingAction = Mode | null;

const HomeScreen = () => {
  const [mode, setMode] = useState<Mode>('create');
  const [sessionName, setSessionName] = useState(generateSessionCode);
  const [playerName, setPlayerName] = useState('');
  const [sessionToJoin, setSessionToJoin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState<PendingAction>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [expiredSession, setExpiredSession] = useState<ActiveSession | null>(null);
  // Blocca i doppi tocchi prima che lo stato "loading" venga applicato
  const busyRef = useRef(false);

  const theme = useAppTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootNavigationProp>();
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(-16);

  const handleDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    const code = extractSessionCode(url);
    if (code) {
      setSessionToJoin(code);
      setMode('join');
      setError('');
    }
  }, []);

  useEffect(() => {
    preferences.getPlayerName().then((saved) => {
      if (saved) setPlayerName(saved);
    });

    Linking.getInitialURL().then(handleDeepLink);
    const linkingListener = Linking.addEventListener('url', (event) => handleDeepLink(event.url));
    return () => linkingListener.remove();
  }, [handleDeepLink]);

  // A ogni ritorno sulla Home verifica se esiste una partita a cui riconnettersi
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const saved = await SessionStorageService.getActiveSession();
        if (!saved?.sessionId || !saved.playerToken) {
          if (!cancelled) {
            setActiveSession(null);
            // Le sessioni salvate dalle versioni precedenti (senza token) non si possono riprendere
            setExpiredSession(saved?.sessionId ? saved : null);
          }
          return;
        }
        const result = await shareService.getSessionInfo(saved.sessionId);
        if (cancelled) return;
        // Se il server non è raggiungibile lasciamo comunque la possibilità di riconnettersi
        const stillActive = result.status === 'error' || (result.status === 'ok' && result.info.isActive);
        setActiveSession(stillActive ? saved : null);
        setExpiredSession(stillActive ? null : saved);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
    headerTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });
  }, [headerOpacity, headerTranslateY]);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const trimmedPlayerName = playerName.trim();
  const canCreate = isValidSessionCode(sessionName) && trimmedPlayerName.length > 0;
  const canJoin = isValidSessionCode(sessionToJoin) && trimmedPlayerName.length > 0;

  const handleRequestError = (err: unknown, action: PendingAction) => {
    setError(err instanceof Error ? err.message : 'Si è verificato un errore');
    setRetryAction(err instanceof ApiError && err.isNetworkError ? action : null);
  };

  const createSession = async () => {
    if (!canCreate || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError('');

    try {
      await preferences.setPlayerName(trimmedPlayerName);
      const data = await api.createSession(sessionName, trimmedPlayerName);
      navigation.navigate('GameSession', {
        sessionId: data.sessionId,
        sessionName: data.sessionName,
        playerId: data.playerId,
        playerName: trimmedPlayerName,
        playerToken: data.playerToken,
        isHost: true,
      });
      setSessionName(generateSessionCode());
    } catch (err) {
      handleRequestError(err, 'create');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const joinSession = async () => {
    if (!canJoin || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError('');

    try {
      await preferences.setPlayerName(trimmedPlayerName);
      const data = await api.joinSession(sessionToJoin, trimmedPlayerName);
      navigation.navigate('GameSession', {
        sessionId: data.sessionId,
        sessionName: data.sessionName,
        playerId: data.playerId,
        playerName: trimmedPlayerName,
        playerToken: data.playerToken,
        isHost: false,
      });
      setSessionToJoin('');
    } catch (err) {
      handleRequestError(err, 'join');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  // Incolla un codice o un link di invito copiato (es. da WhatsApp)
  const pasteCode = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      const code = extractSessionCode(text) ?? sanitizeSessionCode(text);
      if (code) setSessionToJoin(code);
    } catch {
      // Appunti non disponibili: nessuna azione
    }
  };

  const reconnect = (session: ActiveSession) => {
    if (!session.playerToken) return;
    navigation.navigate('GameSession', {
      sessionId: session.sessionId,
      sessionName: session.sessionName || session.sessionId,
      playerId: session.playerId,
      playerName: session.playerName,
      playerToken: session.playerToken,
      isHost: session.isHost,
    });
  };

  const dismissSavedSession = () => {
    SessionStorageService.clearActiveSession();
    setActiveSession(null);
    setExpiredSession(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setRetryAction(null);
  };

  const renderTab = (value: Mode, label: string, kanji: string) => {
    const selected = mode === value;
    return (
      <Pressable
        onPress={() => switchMode(value)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={[
          styles.tab,
          selected && {
            backgroundColor: colors.surface,
            borderColor: colors.outlineVariant,
            shadowColor: colors.shadow,
          },
          selected && styles.tabSelected,
        ]}
      >
        <Text style={[styles.tabLabel, { color: selected ? colors.onSurface : colors.onSurfaceVariant }]}>{label}</Text>
        <Text style={[styles.tabKanji, { color: selected ? colors.primary : colors.onSurfaceVariant }]}>{kanji}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
      <Seigaiha style={[styles.pattern, { height: 300 + insets.top }]} fadeTo={colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 36, paddingBottom: 110 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.header, headerStyle]}>
            <View style={styles.logoRow}>
              <Image source={require('../../assets/icon.png')} style={styles.appIcon} resizeMode="cover" />
              <Hanko label="寿司" size={40} tilt={-6} style={styles.logoHanko} />
            </View>
            <Text style={[typography.display, styles.title, { color: colors.onBackground }]}>Sushi Streak</Text>
            <Text style={[typography.body, styles.tagline, { color: colors.onSurfaceVariant }]}>
              Chi mangia più sushi? Sfida i tuoi amici all&apos;ultimo nigiri.
            </Text>
          </Animated.View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.errorContainer }]} accessibilityRole="alert">
              <Text style={[typography.bodyStrong, { color: colors.onErrorContainer }]}>{error}</Text>
              {retryAction ? (
                <AppButton
                  label="Riprova"
                  icon="refresh"
                  variant="outline"
                  onPress={() => (retryAction === 'join' ? joinSession() : createSession())}
                  disabled={loading}
                  style={styles.retry}
                />
              ) : null}
            </View>
          ) : null}

          {activeSession ? (
            <Panel tone="accent" style={styles.card}>
              <SectionTitle label="Partita in corso" kanji="続き" />
              <Text style={[typography.subtitle, { color: colors.onSurface }]}>
                {activeSession.sessionName || activeSession.sessionId}
              </Text>
              <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
                Giochi come {activeSession.playerName}
              </Text>
              <View style={styles.buttonRow}>
                <AppButton
                  label="Riconnettiti"
                  icon="play"
                  onPress={() => reconnect(activeSession)}
                  style={styles.flex}
                />
                <AppButton label="Ignora" variant="ghost" onPress={dismissSavedSession} />
              </View>
            </Panel>
          ) : null}

          {expiredSession ? (
            <Panel style={styles.card}>
              <SectionTitle label="Sessione terminata" kanji="終了" />
              <Text style={[typography.subtitle, { color: colors.onSurface }]}>
                {expiredSession.sessionName || expiredSession.sessionId}
              </Text>
              <View style={styles.buttonRow}>
                <AppButton
                  label="Crea nuova sessione"
                  icon="plus"
                  variant="tonal"
                  onPress={() => {
                    setSessionName(sanitizeSessionCode(expiredSession.sessionName || expiredSession.sessionId));
                    setPlayerName(expiredSession.playerName);
                    switchMode('create');
                    dismissSavedSession();
                  }}
                  style={styles.flex}
                />
                <AppButton label="Chiudi" variant="ghost" onPress={dismissSavedSession} />
              </View>
            </Panel>
          ) : null}

          <Panel style={styles.card}>
            <View style={[styles.tabs, { backgroundColor: colors.surfaceVariant }]} accessibilityRole="tablist">
              {renderTab('create', 'Crea', '新規')}
              {renderTab('join', 'Partecipa', '参加')}
            </View>

            <Field
              label="Il tuo nome"
              placeholder="Es. Giulia"
              value={playerName}
              onChangeText={setPlayerName}
              maxLength={PLAYER_NAME_MAX_LENGTH}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {mode === 'create' ? (
              <>
                <Field
                  label="Codice della sessione"
                  placeholder="Es. CENA-VENERDI"
                  value={sessionName}
                  onChangeText={(text) => setSessionName(sanitizeSessionCode(text))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={SESSION_CODE_MAX_LENGTH}
                  onSubmitEditing={createSession}
                  returnKeyType="go"
                  hint={`${SESSION_CODE_MIN_LENGTH}-${SESSION_CODE_MAX_LENGTH} caratteri: lettere, numeri e trattino`}
                  style={styles.codeInput}
                  accessory={
                    <Pressable
                      onPress={() => setSessionName(generateSessionCode())}
                      accessibilityRole="button"
                      hitSlop={10}
                    >
                      <Text style={[styles.accessory, { color: colors.primary }]}>Genera nuovo</Text>
                    </Pressable>
                  }
                />
                <AppButton
                  label="Crea partita"
                  kanji="いただきます"
                  size="lg"
                  onPress={createSession}
                  disabled={!canCreate}
                  loading={loading}
                />
              </>
            ) : (
              <>
                <Field
                  label="Codice della sessione"
                  placeholder="Codice o link ricevuto"
                  value={sessionToJoin}
                  onChangeText={(text) => setSessionToJoin(sanitizeSessionCode(text))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={SESSION_CODE_MAX_LENGTH}
                  onSubmitEditing={joinSession}
                  returnKeyType="go"
                  style={styles.codeInput}
                  accessory={
                    <Pressable onPress={pasteCode} accessibilityRole="button" hitSlop={10}>
                      <Text style={[styles.accessory, { color: colors.primary }]}>Incolla</Text>
                    </Pressable>
                  }
                />
                <AppButton
                  label="Entra in partita"
                  kanji="参加"
                  size="lg"
                  onPress={joinSession}
                  disabled={!canJoin}
                  loading={loading}
                />
              </>
            )}
          </Panel>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Navigazione fissa in basso */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.outlineVariant,
            paddingBottom: 12 + insets.bottom,
          },
        ]}
      >
        <AppButton
          label="Storico"
          icon="history"
          variant="outline"
          onPress={() => navigation.navigate('SessionHistory')}
          style={styles.flex}
        />
        <AppButton
          label="Impostazioni"
          icon="cog-outline"
          variant="outline"
          onPress={() => navigation.navigate('Settings')}
          style={styles.flex}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  appIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
  },
  logoHanko: {
    marginLeft: -12,
    marginBottom: -6,
  },
  title: {
    marginBottom: 6,
  },
  tagline: {
    maxWidth: 320,
  },
  card: {
    marginBottom: 16,
  },
  errorBox: {
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  retry: {
    alignSelf: 'flex-start',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: radii.md,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  tabSelected: {
    elevation: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  tabLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  tabKanji: {
    fontSize: 11,
    letterSpacing: 1,
  },
  codeInput: {
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  accessory: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default HomeScreen;
