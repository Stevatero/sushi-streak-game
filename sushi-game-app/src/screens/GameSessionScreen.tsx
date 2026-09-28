import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { IconButton, Snackbar } from 'react-native-paper';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import useGameStore, { Player } from '../store/gameStore';
import SushiStack from '../components/SushiStack';
import SakuraCelebration from '../components/SakuraCelebration';
import SoundManager from '../utils/SoundManager';
import { SessionStorageService, SavedSession } from '../services/sessionStorage';
import { shareService } from '../services/shareService';
import { RESTAURANT_NAME_MAX_LENGTH } from '../config';
import type { RootNavigationProp, RootStackParamList } from '../navigation/types';
import { AppTheme, fonts, radii, typography, useAppTheme } from '../theme/theme';
import AppButton from '../components/ui/AppButton';
import Field from '../components/ui/Field';
import Hanko from '../components/ui/Hanko';
import Panel from '../components/ui/Panel';
import SectionTitle from '../components/ui/SectionTitle';
import Sheet from '../components/ui/Sheet';
import Tag from '../components/ui/Tag';

const CELEBRATION_DURATION_MS = 6000;

// Posizione "sportiva": a pari punteggio si condivide il posto (1, 2, 2, 4)
const rankOf = (players: Player[], score: number) => 1 + players.filter((p) => p.score > score).length;

const medalColor = (rank: number, colors: AppTheme['colors']) =>
  rank === 1 ? colors.gold : rank === 2 ? colors.silver : rank === 3 ? colors.bronze : undefined;

const GameSessionScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'GameSession'>>();
  const navigation = useNavigation<RootNavigationProp>();
  const theme = useAppTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { sessionId, sessionName, playerName, playerId, playerToken, isHost } = route.params;

  const { players, gameEnded, endReason, connection, status, startSession, addPiece, removePiece, finishGame } =
    useGameStore(
      useShallow((s) => ({
        players: s.players,
        gameEnded: s.gameEnded,
        endReason: s.endReason,
        connection: s.connection,
        status: s.status,
        startSession: s.startSession,
        addPiece: s.addPiece,
        removePiece: s.removePiece,
        finishGame: s.finishGame,
      }))
    );

  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [snackbar, setSnackbar] = useState('');

  const startedAtRef = useRef<string>(new Date().toISOString());
  const restaurantRef = useRef('');
  const allowExitRef = useRef(false);
  const endHandledRef = useRef(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Salvataggio iniziale della sessione attiva: la pulizia di fine partita deve avvenire dopo
  const activeSavedRef = useRef<Promise<void>>(Promise.resolve());

  const me = players.find((p) => p.id === playerId);
  const myScore = me?.score ?? 0;
  const hasFinished = finishRequested || !!me?.finished;
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const myRank = me ? rankOf(players, me.score) : 0;
  const topScore = sortedPlayers[0]?.score ?? 0;
  const winners = useMemo(
    () => (topScore > 0 ? sortedPlayers.filter((p) => p.score === topScore) : []),
    [sortedPlayers, topScore]
  );
  const iWon = winners.some((p) => p.id === playerId);
  const winnerText =
    winners.length === 0
      ? 'Nessun pezzo mangiato'
      : winners.length > 1
        ? `Pareggio tra ${winners.map((p) => p.name).join(' e ')} con ${topScore} pezzi!`
        : `Vince ${winners[0].name} con ${topScore} pezzi!`;
  const isOnline = connection === 'connected';
  const canShare = status === 'active' && !gameEnded;

  // Avvio o ripresa della partita: il socket si (ri)collega con le credenziali del giocatore
  useEffect(() => {
    startSession({ sessionId, sessionName, playerId, playerName, playerToken, isHost });

    activeSavedRef.current = (async () => {
      const saved = await SessionStorageService.getActiveSession();
      // In caso di riconnessione si conserva l'orario di inizio originale
      if (saved?.sessionId === sessionId && saved.playerId === playerId && saved.startedAt) {
        startedAtRef.current = saved.startedAt;
      }
      await SessionStorageService.saveActiveSession({
        sessionId,
        sessionName,
        playerId,
        playerName,
        playerToken,
        isHost,
        startedAt: startedAtRef.current,
      });
    })();

    // All'uscita dalla schermata si abbandona la stanza e si chiude il socket
    return () => useGameStore.getState().resetGame();
  }, [sessionId, sessionName, playerId, playerName, playerToken, isHost, startSession]);

  useEffect(
    () => () => {
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    },
    []
  );

  // Uscita con conferma (tasto indietro Android): la partita resta riprendibile dalla Home
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current || gameEnded) return;
      e.preventDefault();
      Alert.alert('Uscire dalla partita?', 'Potrai rientrare dalla Home finché la sessione è attiva.', [
        { text: 'Resta', style: 'cancel' },
        {
          text: 'Esci',
          style: 'destructive',
          onPress: () => {
            allowExitRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, gameEnded]);

  const persistResult = useCallback(
    async (list: Player[]) => {
      if (list.length === 0) return;
      const sorted = [...list].sort((a, b) => b.score - a.score);
      const best = sorted[0]?.score ?? 0;
      const tied = sorted.filter((p) => p.score === best);
      const record: SavedSession = {
        id: `${sessionId}:${startedAtRef.current}`,
        sessionName,
        restaurant: restaurantRef.current,
        date: startedAtRef.current,
        players: sorted,
        winner: {
          name: best > 0 ? tied.map((p) => p.name).join(' e ') : 'Nessuno',
          score: best,
        },
        duration: SessionStorageService.formatDuration(startedAtRef.current),
      };
      try {
        await SessionStorageService.upsertSession(record);
      } catch {
        setSnackbar('Impossibile salvare la partita nello storico');
      }
    },
    [sessionId, sessionName]
  );

  // Salvataggio automatico nello storico quando il giocatore ha finito o la partita è chiusa
  useEffect(() => {
    if (hasFinished || gameEnded) persistResult(players);
  }, [players, hasFinished, gameEnded, persistResult]);

  // Gestione della fine partita (tutti hanno finito, scadenza o credenziali non valide)
  useEffect(() => {
    if (!gameEnded || endHandledRef.current) return;
    endHandledRef.current = true;
    activeSavedRef.current.then(() => SessionStorageService.clearActiveSession());

    if (endReason === 'ended') {
      setShowLeaderboardModal(true);
      if (iWon) {
        SoundManager.playVictorySound();
        setShowCelebration(true);
        celebrationTimerRef.current = setTimeout(() => setShowCelebration(false), CELEBRATION_DURATION_MS);
      }
    } else if (endReason === 'expired') {
      Alert.alert(
        'Sessione scaduta',
        'La sessione è stata chiusa per inattività. I punteggi sono stati salvati nello storico.'
      );
    } else if (endReason === 'unauthorized' || endReason === 'not_found') {
      Alert.alert('Sessione non disponibile', 'Non è possibile rientrare in questa partita.', [
        { text: 'OK', onPress: () => goHome() },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameEnded, endReason]);

  const goHome = () => {
    allowExitRef.current = true;
    navigation.popTo('Home');
  };

  // Pulsante "+1": piccolo rimbalzo e un'onda che si allarga
  const pressScale = useSharedValue(1);
  const ring = useSharedValue(0);
  const addButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.45 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.55 }],
  }));

  const handleAddPiece = async () => {
    if (!isOnline) {
      setSnackbar('Sei offline: attendi la riconnessione');
      return;
    }
    SoundManager.playPieceSound();
    pressScale.value = withSequence(withTiming(0.9, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 }));
    ring.value = 0;
    ring.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });

    const res = await addPiece();
    if (!res.ok && res.code !== 'rate_limited') setSnackbar(res.error || 'Pezzo non registrato');
  };

  const handleRemovePiece = async () => {
    const res = await removePiece();
    setSnackbar(res.ok ? 'Ultimo pezzo annullato' : res.error || 'Impossibile annullare');
  };

  const handleFinish = () => {
    Alert.alert('Hai finito di mangiare?', 'Dopo la conferma non potrai più aggiungere pezzi.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Ho finito!',
        onPress: async () => {
          setFinishRequested(true);
          const res = await finishGame();
          if (!res.ok) {
            setFinishRequested(false);
            setSnackbar(res.error || 'Impossibile completare, riprova');
            return;
          }
          setShowLeaderboardModal(true);
        },
      },
    ]);
  };

  const copySessionCode = async () => {
    const success = await shareService.copySessionCode(sessionId);
    setShowShareModal(false);
    setSnackbar(success ? 'Codice sessione copiato!' : 'Impossibile copiare il codice');
  };

  const shareSessionLink = async () => {
    const result = await shareService.shareSession(sessionId, sessionName);
    setShowShareModal(false);
    if (result === 'error') setSnackbar('Impossibile condividere la sessione');
  };

  const saveRestaurant = async () => {
    restaurantRef.current = restaurantName.trim();
    await persistResult(useGameStore.getState().players);
    setShowSaveModal(false);
    setSnackbar('Partita salvata nello storico');
  };

  const renderRankBadge = (rank: number, size = 28) => {
    const medal = medalColor(rank, colors);
    return (
      <Hanko
        label={String(rank)}
        size={size}
        shape="circle"
        tilt={0}
        color={medal ?? colors.surfaceVariant}
        textColor={medal ? '#FFFFFF' : colors.onSurfaceVariant}
      />
    );
  };

  const renderPlayerRow = (item: Player) => {
    const isMe = item.id === playerId;
    return (
      <View style={[styles.playerRow, isMe && { backgroundColor: colors.primaryContainer }]}>
        {renderRankBadge(rankOf(players, item.score))}
        <Text
          style={[styles.playerName, { color: isMe ? colors.onPrimaryContainer : colors.onSurface }]}
          numberOfLines={1}
        >
          {item.name}
          {isMe ? ' (tu)' : ''}
        </Text>
        {item.finished ? (
          <Tag label="Finito" kanji="完" color={colors.onTertiaryContainer} background={colors.tertiaryContainer} />
        ) : null}
        <Text style={[styles.playerScore, { color: isMe ? colors.onPrimaryContainer : colors.onSurface }]}>
          {item.score}
        </Text>
      </View>
    );
  };

  const podium = sortedPlayers.slice(0, 3);
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  const connectionLabel = isOnline ? 'Online' : connection === 'connecting' ? 'Riconnessione…' : 'Offline';
  const connectionColor = isOnline ? colors.tertiary : connection === 'connecting' ? colors.gold : colors.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SushiStack pieceCount={myScore} />
      {/* Con la classifica finale aperta i petali cadono sopra il pannello */}
      <SakuraCelebration isVisible={showCelebration && !showLeaderboardModal} />

      {/* Barra superiore */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel="Esci dalla partita"
          iconColor={colors.onSurface}
          onPress={() => navigation.goBack()}
          style={[styles.roundIcon, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }]}
        />
        <Pressable
          onPress={canShare ? () => setShowShareModal(true) : undefined}
          disabled={!canShare}
          accessibilityRole="button"
          accessibilityLabel="Condividi la sessione"
          style={[styles.sessionChip, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }]}
        >
          <View style={[styles.statusDot, { backgroundColor: connectionColor }]} />
          <View style={styles.sessionChipText}>
            <Text style={[styles.sessionCode, { color: colors.onSurface }]} numberOfLines={1}>
              {sessionName || sessionId}
            </Text>
            <Text style={[typography.caption, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {canShare ? `${connectionLabel} · Tocca per invitare` : connectionLabel}
            </Text>
          </View>
          {canShare ? <MaterialCommunityIcons name="share-variant" size={18} color={colors.primary} /> : null}
        </Pressable>
        <IconButton
          icon="cog-outline"
          accessibilityLabel="Impostazioni"
          iconColor={colors.onSurface}
          onPress={() => navigation.navigate('Settings')}
          style={[styles.roundIcon, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }]}
        />
      </View>

      {!isOnline && !gameEnded ? (
        <View style={[styles.connectionBanner, { backgroundColor: colors.errorContainer }]}>
          <MaterialCommunityIcons
            name={connection === 'connecting' ? 'wifi-sync' : 'wifi-off'}
            size={16}
            color={colors.onErrorContainer}
          />
          <Text style={[typography.caption, { color: colors.onErrorContainer }]}>
            {connection === 'connecting' ? 'Riconnessione in corso…' : 'Non connesso al server'}
          </Text>
        </View>
      ) : null}

      {/* Punteggio personale */}
      <View style={styles.hero}>
        <SectionTitle label="I tuoi pezzi" kanji="貫" style={styles.heroLabel} />
        <Text style={[styles.heroScore, { color: colors.onBackground }]} accessibilityLabel={`${myScore} pezzi`}>
          {myScore}
        </Text>
        {myRank > 0 ? (
          <View style={styles.heroRank}>
            {renderRankBadge(myRank, 26)}
            <Text style={[typography.bodyStrong, { color: colors.onSurfaceVariant }]}>
              {`Sei ${myRank}° su ${players.length} · ${myScore} pezzi`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Classifica in tempo reale */}
      <Panel tone="glass" style={styles.leaderboard}>
        <SectionTitle
          label="Classifica"
          kanji="順位"
          right={
            <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{players.length} giocatori</Text>
          }
        />
        <FlatList
          data={sortedPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderPlayerRow(item)}
          style={styles.liveList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </Panel>

      <View style={styles.flex} pointerEvents="none" />

      {/* Comandi */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 18 }]}>
        {!gameEnded && !hasFinished ? (
          <View style={styles.controlsRow}>
            <View style={styles.sideControl}>
              <IconButton
                icon="undo-variant"
                accessibilityLabel="Annulla ultimo"
                iconColor={colors.onSurface}
                size={24}
                onPress={handleRemovePiece}
                disabled={myScore === 0 || !isOnline}
                style={[styles.sideButton, { backgroundColor: colors.glass, borderColor: colors.outline }]}
              />
              <Text style={[styles.caption, { color: colors.onSurface, backgroundColor: colors.glass }]}>Annulla</Text>
            </View>

            <View style={styles.addWrapper}>
              <Animated.View
                pointerEvents="none"
                style={[styles.addRing, { borderColor: colors.primary }, ringStyle]}
              />
              <Animated.View style={addButtonStyle}>
                <Pressable
                  onPress={handleAddPiece}
                  accessibilityRole="button"
                  accessibilityLabel="Aggiungi pezzo"
                  style={[
                    styles.addButton,
                    { backgroundColor: colors.primary, shadowColor: colors.primary, opacity: isOnline ? 1 : 0.55 },
                  ]}
                >
                  <Text style={[styles.addPlus, { color: colors.onPrimary }]}>+1</Text>
                  <Text style={[styles.addKanji, { color: colors.onPrimary }]}>貫</Text>
                </Pressable>
              </Animated.View>
              <Text
                style={[styles.caption, styles.addCaption, { color: colors.onSurface, backgroundColor: colors.glass }]}
              >
                Aggiungi pezzo
              </Text>
            </View>

            <View style={styles.sideControl}>
              <IconButton
                icon="flag-checkered"
                accessibilityLabel="Ho finito!"
                iconColor={colors.onSurface}
                size={24}
                onPress={handleFinish}
                style={[styles.sideButton, { backgroundColor: colors.glass, borderColor: colors.outline }]}
              />
              <Text style={[styles.caption, { color: colors.onSurface, backgroundColor: colors.glass }]}>
                Ho finito
              </Text>
            </View>
          </View>
        ) : null}

        {!gameEnded && hasFinished ? (
          <Panel tone="glass" style={styles.statusPanel}>
            <Hanko label="完" size={46} />
            <View style={styles.flex}>
              <Text style={[typography.subtitle, { color: colors.onSurface }]}>Hai finito! ごちそうさま</Text>
              <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>
                In attesa degli altri giocatori…
              </Text>
            </View>
          </Panel>
        ) : null}

        {gameEnded ? (
          <Panel tone="glass">
            <View style={styles.statusPanel}>
              <Hanko label="勝" size={50} color={iWon ? colors.gold : colors.primary} />
              <View style={styles.flex}>
                <Text style={[typography.title, { color: colors.onSurface }]}>
                  {endReason === 'expired' ? 'Sessione scaduta' : 'Partita terminata!'}
                </Text>
                <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>{winnerText}</Text>
              </View>
            </View>
            <View style={styles.endButtons}>
              <AppButton
                label="Ristorante"
                icon="map-marker-outline"
                variant="outline"
                onPress={() => setShowSaveModal(true)}
                style={styles.flex}
              />
              <AppButton label="Nuova partita" icon="plus" onPress={goHome} style={styles.flex} />
            </View>
          </Panel>
        ) : null}
      </View>

      {/* Classifica finale */}
      <Sheet
        visible={showLeaderboardModal}
        onClose={() => setShowLeaderboardModal(false)}
        title={gameEnded ? 'Classifica finale' : 'Classifica attuale'}
        kanji="結果"
        overlay={<SakuraCelebration isVisible={showCelebration} />}
      >
        {gameEnded && winners.length > 0 ? (
          <Text style={[typography.bodyStrong, styles.sheetWinner, { color: colors.primary }]}>{winnerText}</Text>
        ) : null}
        {podiumOrder.length > 1 ? (
          <View style={styles.podium}>
            {podiumOrder.map((p) => {
              const rank = rankOf(players, p.score);
              const height = rank === 1 ? 86 : rank === 2 ? 64 : 48;
              return (
                <View key={p.id} style={styles.podiumColumn}>
                  <Text style={[styles.podiumName, { color: colors.onSurface }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{p.score} pezzi</Text>
                  <View
                    style={[
                      styles.podiumBlock,
                      { height, backgroundColor: p.id === playerId ? colors.primaryContainer : colors.surfaceVariant },
                    ]}
                  >
                    {renderRankBadge(rank, 32)}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <FlatList
          data={podiumOrder.length > 1 ? sortedPlayers.slice(3) : sortedPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderPlayerRow(item)}
          style={styles.sheetList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        <Text style={[typography.caption, styles.savedNote, { color: colors.onSurfaceVariant }]}>
          La partita viene salvata automaticamente nello storico.
        </Text>

        <View style={styles.sheetButtons}>
          <AppButton
            label="Nuova partita"
            icon="plus"
            onPress={() => {
              setShowLeaderboardModal(false);
              goHome();
            }}
          />
          <View style={styles.endButtons}>
            <AppButton
              label="Ristorante"
              icon="map-marker-outline"
              variant="outline"
              onPress={() => {
                setShowLeaderboardModal(false);
                setShowSaveModal(true);
              }}
              style={styles.flex}
            />
            <AppButton
              label="Chiudi"
              variant="ghost"
              onPress={() => setShowLeaderboardModal(false)}
              style={styles.flex}
            />
          </View>
        </View>
      </Sheet>

      {/* Nome del ristorante */}
      <Sheet visible={showSaveModal} onClose={() => setShowSaveModal(false)} title="Dove avete mangiato?" kanji="店">
        <Field
          label="Nome del ristorante"
          placeholder="Es. Sushi Zen, Sakura…"
          value={restaurantName}
          onChangeText={setRestaurantName}
          maxLength={RESTAURANT_NAME_MAX_LENGTH}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveRestaurant}
        />
        <View style={[styles.infoBox, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>Sessione: {sessionName}</Text>
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
            Data: {SessionStorageService.formatDate(startedAtRef.current)}
          </Text>
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{winnerText}</Text>
        </View>
        <View style={styles.endButtons}>
          <AppButton label="Annulla" variant="ghost" onPress={() => setShowSaveModal(false)} style={styles.flex} />
          <AppButton label="Salva" icon="check" onPress={saveRestaurant} style={styles.flex} />
        </View>
      </Sheet>

      {/* Invito */}
      <Sheet visible={showShareModal} onClose={() => setShowShareModal(false)} title="Invita amici" kanji="招待">
        <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>
          Condividi il link oppure fai inserire il codice nella schermata iniziale.
        </Text>
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

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={2500}
        style={[styles.snackbar, { marginBottom: insets.bottom + 150 }]}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  roundIcon: {
    borderWidth: StyleSheet.hairlineWidth,
    margin: 0,
  },
  sessionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionChipText: {
    flex: 1,
  },
  sessionCode: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 1.2,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  hero: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  heroLabel: {
    marginBottom: 0,
  },
  heroScore: {
    fontFamily: fonts.black,
    fontSize: 84,
    lineHeight: 92,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  heroRank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaderboard: {
    marginHorizontal: 16,
    paddingBottom: 10,
  },
  liveList: {
    maxHeight: 196,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  playerName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  playerScore: {
    fontFamily: fonts.bold,
    fontSize: 18,
    minWidth: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  separator: {
    height: 2,
  },
  controls: {
    paddingHorizontal: 16,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideControl: {
    alignItems: 'center',
    width: 76,
    marginBottom: 26,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    margin: 0,
  },
  // Le didascalie hanno uno sfondo semitrasparente per restare leggibili sopra la pila
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  addWrapper: {
    alignItems: 'center',
  },
  addRing: {
    position: 'absolute',
    top: 0,
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
  },
  addButton: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  addPlus: {
    fontFamily: fonts.black,
    fontSize: 38,
    lineHeight: 42,
  },
  addKanji: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.85,
  },
  addCaption: {
    fontSize: 13,
    marginTop: 10,
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  endButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sheetWinner: {
    marginBottom: 12,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 12,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
  },
  podiumName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  podiumBlock: {
    alignSelf: 'stretch',
    marginTop: 6,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    alignItems: 'center',
    paddingTop: 10,
  },
  sheetList: {
    maxHeight: 220,
  },
  savedNote: {
    textAlign: 'center',
    marginTop: 10,
  },
  sheetButtons: {
    gap: 10,
    marginTop: 16,
  },
  infoBox: {
    borderRadius: radii.md,
    padding: 14,
    gap: 4,
  },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    alignItems: 'center',
    paddingVertical: 18,
    marginTop: 16,
    gap: 4,
  },
  codeText: {
    fontFamily: fonts.black,
    fontSize: 30,
    letterSpacing: 4,
  },
  snackbar: {
    marginHorizontal: 16,
  },
});

export default GameSessionScreen;
