import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
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
import { plural } from '../utils/plural';
import { SessionStorageService, buildSavedSession } from '../services/sessionStorage';
import { shareService } from '../services/shareService';
import { RESTAURANT_NAME_MAX_LENGTH } from '../config';
import { useExclusiveModal } from '../hooks/useExclusiveModal';
import type { RootNavigationProp, RootStackParamList } from '../navigation/types';
import { AppTheme, fonts, radii, typography, useAppTheme } from '../theme/theme';
import AppButton from '../components/ui/AppButton';
import ConfirmSheet, { ConfirmOptions } from '../components/ui/ConfirmSheet';
import Field from '../components/ui/Field';
import Hanko from '../components/ui/Hanko';
import Panel from '../components/ui/Panel';
import SectionTitle from '../components/ui/SectionTitle';
import Sheet from '../components/ui/Sheet';
import Tag from '../components/ui/Tag';

const CELEBRATION_DURATION_MS = 6000;
// Dopo aver finito, lo storico si aggiorna al massimo ogni SAVE_DEBOUNCE_MS mentre gli altri mangiano
const SAVE_DEBOUNCE_MS = 1500;

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
  const { sessionId, sessionName, playerName, playerId, playerToken, isHost, sessionStartedAt } = route.params;

  const {
    players,
    hostId,
    gameEnded,
    endReason,
    connection,
    status,
    startSession,
    addPiece,
    removePiece,
    finishGame,
    kickPlayer,
  } = useGameStore(
    useShallow((s) => ({
      players: s.players,
      hostId: s.hostId,
      gameEnded: s.gameEnded,
      endReason: s.endReason,
      connection: s.connection,
      status: s.status,
      startSession: s.startSession,
      addPiece: s.addPiece,
      removePiece: s.removePiece,
      finishGame: s.finishGame,
      kickPlayer: s.kickPlayer,
    }))
  );

  // Finestre modali: classifica, nome del ristorante, invito e conferme (una alla volta)
  const { modal, openModal, closeModal, afterModalClose } = useExclusiveModal<
    'leaderboard' | 'restaurant' | 'share' | 'confirm'
  >();
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [celebrationDone, setCelebrationDone] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [snackbar, setSnackbar] = useState('');

  // Inizio della partita: il ref serve ai callback, lo stato alla visualizzazione
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const startedAtRef = useRef(startedAt);
  const restaurantRef = useRef('');
  // true quando il giocatore ha salvato il ristorante in questa schermata (anche vuoto)
  const restaurantEditedRef = useRef(false);
  // Classifica in attesa di essere salvata nello storico (salvataggio differito)
  const pendingSaveRef = useRef<Player[] | null>(null);
  const allowExitRef = useRef(false);
  const endHandledRef = useRef(false);
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
        ? `Pareggio tra ${winners.map((p) => p.name).join(' e ')} con ${plural(topScore, 'pezzo', 'pezzi')}!`
        : `Vince ${winners[0].name} con ${plural(topScore, 'pezzo', 'pezzi')}!`;
  const isOnline = connection === 'connected';
  // Solo con un server che indica l'host (1.3+) si possono rimuovere i giocatori
  const amHost = !!hostId && hostId === playerId;
  const canShare = status === 'active' && !gameEnded;
  // Petali di ciliegio per chi vince, per qualche secondo dopo la fine della partita
  const showCelebration = gameEnded && endReason === 'ended' && iWon && !celebrationDone;

  // Avvio o ripresa della partita: il socket si (ri)collega con le credenziali del giocatore
  useEffect(() => {
    startSession({ sessionId, sessionName, playerId, playerName, playerToken, isHost });

    activeSavedRef.current = (async () => {
      const saved = await SessionStorageService.getActiveSession();
      const resumed = saved?.sessionId === sessionId && saved.playerId === playerId;
      // In caso di riconnessione si conserva l'orario di inizio originale
      if (resumed && saved.startedAt) {
        startedAtRef.current = saved.startedAt;
        setStartedAt(saved.startedAt);
      }
      // ...e il ristorante già indicato per questa partita
      const record = await SessionStorageService.getSavedSession(`${sessionId}:${startedAtRef.current}`);
      if (record?.restaurant && !restaurantEditedRef.current) {
        restaurantRef.current = record.restaurant;
        setRestaurantName(record.restaurant);
      }
      await SessionStorageService.saveActiveSession({
        sessionId,
        sessionName,
        playerId,
        playerName,
        playerToken,
        isHost,
        startedAt: startedAtRef.current,
        sessionStartedAt: sessionStartedAt ?? (resumed ? saved.sessionStartedAt : undefined),
      });
    })();

    // All'uscita dalla schermata si abbandona la stanza e si chiude il socket
    return () => useGameStore.getState().resetGame();
  }, [sessionId, sessionName, playerId, playerName, playerToken, isHost, sessionStartedAt, startSession]);

  useEffect(() => {
    if (!showCelebration) return;
    const timer = setTimeout(() => setCelebrationDone(true), CELEBRATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showCelebration]);

  const showDialog = useCallback(
    (options: ConfirmOptions) => {
      setDialog(options);
      openModal('confirm');
    },
    [openModal]
  );

  const goHome = () => {
    allowExitRef.current = true;
    navigation.popTo('Home');
  };

  // Uscita con conferma (freccia, tasto o gesto indietro): la partita resta riprendibile dalla Home
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current || gameEnded) return;
      e.preventDefault();
      showDialog({
        seal: '帰',
        kanji: 'またね',
        title: 'Uscire dalla partita?',
        message: 'I tuoi pezzi restano salvati: potrai rientrare dalla Home finché la sessione è attiva.',
        confirmLabel: 'Esci dalla partita',
        confirmIcon: 'logout',
        destructive: true,
        cancelLabel: 'Resta',
        onConfirm: () => {
          allowExitRef.current = true;
          afterModalClose(() => navigation.dispatch(e.data.action));
        },
      });
    });
  }, [navigation, gameEnded, showDialog, afterModalClose]);

  const persistResult = useCallback(
    async (list: Player[]) => {
      if (list.length === 0) return;
      // Orario di inizio e ristorante di una partita ripresa vengono prima letti dallo storage:
      // così la voce dello storico resta la stessa e non se ne crea una doppia
      await activeSavedRef.current;
      const record = buildSavedSession({
        sessionId,
        sessionName,
        startedAt: startedAtRef.current,
        restaurant: restaurantRef.current,
        players: list,
        duration: SessionStorageService.formatDuration(startedAtRef.current),
      });
      try {
        // Il ristorante già salvato resta, a meno che il giocatore non lo abbia cambiato qui
        await SessionStorageService.upsertSession(record, { keepExisting: !restaurantEditedRef.current });
      } catch {
        setSnackbar('Impossibile salvare la partita nello storico');
      }
    },
    [sessionId, sessionName]
  );

  const persistResultRef = useRef(persistResult);
  useEffect(() => {
    persistResultRef.current = persistResult;
  }, [persistResult]);

  // Salvataggio automatico nello storico quando il giocatore ha finito o la partita è chiusa: a fine
  // partita subito, prima (mentre gli altri mangiano ancora) al massimo ogni SAVE_DEBOUNCE_MS
  /* eslint-disable react-hooks/set-state-in-effect -- persistResult è asincrona: l'eventuale avviso
     (setSnackbar) arriva solo dopo il salvataggio */
  useEffect(() => {
    // Chi è stato rimosso o non può rientrare non salva la partita nello storico
    const excluded = endReason === 'kicked' || endReason === 'unauthorized' || endReason === 'not_found';
    if (excluded || !(hasFinished || gameEnded)) {
      pendingSaveRef.current = null;
      return;
    }
    if (gameEnded) {
      pendingSaveRef.current = null;
      persistResult(players);
      return;
    }
    pendingSaveRef.current = players;
    const timer = setTimeout(() => {
      pendingSaveRef.current = null;
      persistResult(players);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [players, hasFinished, gameEnded, endReason, persistResult]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Uscendo dalla schermata si salva l'eventuale classifica ancora in attesa
  useEffect(
    () => () => {
      const pending = pendingSaveRef.current;
      if (pending) persistResultRef.current(pending);
    },
    []
  );

  // Gestione della fine partita (tutti hanno finito, scadenza o credenziali non valide): reazione,
  // una sola volta, all'evento del server, che apre la finestra con l'esito
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!gameEnded || endHandledRef.current) return;
    endHandledRef.current = true;
    activeSavedRef.current.then(() => SessionStorageService.clearActiveSession());

    // Le finestre ancora aperte (es. una conferma) lasciano il posto all'esito della partita
    const leaveGame = () => afterModalClose(goHome);
    if (endReason === 'ended') {
      openModal('leaderboard');
      if (iWon) SoundManager.playVictorySound();
    } else if (endReason === 'expired') {
      showDialog({
        seal: '時',
        kanji: '時間切れ',
        title: 'Sessione scaduta',
        message: 'La sessione è stata chiusa per inattività. I punteggi sono stati salvati nello storico.',
        confirmLabel: 'Ho capito',
      });
    } else if (endReason === 'kicked') {
      showDialog({
        seal: '退',
        title: 'Sei stato rimosso dalla partita',
        message: 'Chi ha creato la partita ti ha tolto dalla classifica.',
        confirmLabel: 'Torna alla Home',
        confirmIcon: 'home-outline',
        dismissable: false,
        onConfirm: leaveGame,
        onCancel: leaveGame,
      });
    } else if (endReason === 'unauthorized' || endReason === 'not_found') {
      showDialog({
        seal: '閉',
        title: 'Sessione non disponibile',
        message: 'Non è possibile rientrare in questa partita.',
        confirmLabel: 'Torna alla Home',
        confirmIcon: 'home-outline',
        dismissable: false,
        onConfirm: leaveGame,
        onCancel: leaveGame,
      });
    } else {
      closeModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameEnded, endReason]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    pressScale.set(withSequence(withTiming(0.9, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 })));
    ring.set(0);
    ring.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));

    const res = await addPiece();
    if (!res.ok) {
      setSnackbar(
        res.code === 'rate_limited' ? 'Troppo veloce: pezzo non contato' : res.error || 'Pezzo non registrato'
      );
    }
  };

  const handleRemovePiece = async () => {
    const res = await removePiece();
    // Il "bop" accompagna la scomparsa del pezzo dalla pila
    if (res.ok) SoundManager.playUndoSound();
    setSnackbar(res.ok ? 'Ultimo pezzo annullato' : res.error || 'Impossibile annullare');
  };

  const confirmFinish = async () => {
    setFinishRequested(true);
    const res = await finishGame();
    if (!res.ok) {
      setFinishRequested(false);
      setSnackbar(res.error || 'Impossibile completare, riprova');
      return;
    }
    if (!useGameStore.getState().gameEnded) openModal('leaderboard');
  };

  const handleFinish = () => {
    showDialog({
      seal: '完',
      kanji: 'ごちそうさま',
      title: 'Hai finito di mangiare?',
      message: 'Dopo la conferma non potrai più aggiungere pezzi.',
      details: (
        <View style={[styles.finishSummary, { backgroundColor: colors.surfaceVariant }]}>
          <View style={styles.finishStat}>
            <Text style={[styles.finishValue, { color: colors.onSurface }]}>{myScore}</Text>
            <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
              {myScore === 1 ? 'pezzo mangiato' : 'pezzi mangiati'}
            </Text>
          </View>
          {myRank > 0 ? (
            <>
              <View style={[styles.finishDivider, { backgroundColor: colors.outline }]} />
              <View style={styles.finishStat}>
                <Text style={[styles.finishValue, { color: colors.onSurface }]}>{`${myRank}°`}</Text>
                <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
                  {`posto su ${players.length}`}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ),
      confirmLabel: 'Sì, ho finito!',
      confirmIcon: 'flag-checkered',
      cancelLabel: 'Mangio ancora',
      onConfirm: confirmFinish,
    });
  };

  const copySessionCode = async () => {
    const success = await shareService.copySessionCode(sessionId);
    closeModal();
    setSnackbar(success ? 'Codice sessione copiato!' : 'Impossibile copiare il codice');
  };

  const shareSessionLink = async () => {
    const result = await shareService.shareSession(sessionId, sessionName);
    closeModal();
    if (result === 'error') setSnackbar('Impossibile condividere la sessione');
  };

  const saveRestaurant = async () => {
    restaurantRef.current = restaurantName.trim();
    restaurantEditedRef.current = true;
    await persistResult(useGameStore.getState().players);
    closeModal();
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

  const confirmKick = (target: Player) => {
    showDialog({
      seal: '退',
      title: `Rimuovere ${target.name}?`,
      message: 'Il giocatore uscirà dalla partita e dalla classifica.',
      confirmLabel: 'Rimuovi',
      confirmIcon: 'account-remove-outline',
      destructive: true,
      cancelLabel: 'Annulla',
      onConfirm: async () => {
        const res = await kickPlayer(target.id);
        setSnackbar(res.ok ? `${target.name} è stato rimosso` : res.error || 'Impossibile rimuovere il giocatore');
      },
    });
  };

  // I giocatori si rimuovono dalla classifica sullo schermo, non da quella nel pannello a scomparsa
  const renderPlayerRow = (item: Player, kickable = false) => {
    const isMe = item.id === playerId;
    const canKick = kickable && amHost && !isMe && !gameEnded;
    return (
      <Pressable
        onPress={canKick ? () => confirmKick(item) : undefined}
        disabled={!canKick}
        accessibilityRole={canKick ? 'button' : undefined}
        accessibilityHint={canKick ? 'Rimuovi il giocatore dalla partita' : undefined}
        style={({ pressed }) => [
          styles.playerRow,
          isMe && { backgroundColor: colors.primaryContainer },
          pressed && { backgroundColor: colors.surfaceVariant },
        ]}
      >
        {renderRankBadge(rankOf(players, item.score))}
        <Text
          style={[styles.playerName, { color: isMe ? colors.onPrimaryContainer : colors.onSurface }]}
          numberOfLines={1}
        >
          {item.name}
          {isMe ? ' (tu)' : ''}
        </Text>
        {item.id === hostId ? (
          <MaterialCommunityIcons
            name="crown-outline"
            size={16}
            color={isMe ? colors.onPrimaryContainer : colors.gold}
            accessibilityLabel="Host"
          />
        ) : null}
        {item.finished ? (
          <Tag label="Finito" kanji="完" color={colors.onTertiaryContainer} background={colors.tertiaryContainer} />
        ) : null}
        <Text style={[styles.playerScore, { color: isMe ? colors.onPrimaryContainer : colors.onSurface }]}>
          {item.score}
        </Text>
      </Pressable>
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
      <SakuraCelebration isVisible={showCelebration && modal !== 'leaderboard'} />

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
          onPress={canShare ? () => openModal('share') : undefined}
          disabled={!canShare}
          accessibilityRole="button"
          accessibilityLabel="Condividi la sessione"
          style={[styles.sessionChip, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }]}
        >
          <Text style={[styles.sessionCode, { color: colors.onSurface }]} numberOfLines={1}>
            {sessionName || sessionId}
          </Text>
          <View style={styles.sessionStatus}>
            <View style={[styles.statusDot, { backgroundColor: connectionColor }]} />
            <Text style={[typography.caption, styles.shrink, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {canShare ? `${connectionLabel} · Tocca per invitare` : connectionLabel}
            </Text>
            {canShare ? <MaterialCommunityIcons name="share-variant" size={13} color={colors.primary} /> : null}
          </View>
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
        <SectionTitle label="I tuoi pezzi" kanji="貫" centered style={styles.heroLabel} />
        <Text
          style={[styles.heroScore, { color: colors.onBackground }]}
          accessibilityLabel={plural(myScore, 'pezzo', 'pezzi')}
        >
          {myScore}
        </Text>
        {myRank > 0 ? (
          <View style={styles.heroRank}>
            {renderRankBadge(myRank, 26)}
            <Text style={[typography.bodyStrong, { color: colors.onSurfaceVariant }]}>
              {`Sei ${myRank}° su ${players.length} · ${plural(myScore, 'pezzo', 'pezzi')}`}
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
            <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
              {plural(players.length, 'giocatore', 'giocatori')}
            </Text>
          }
        />
        <FlatList
          data={sortedPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderPlayerRow(item, true)}
          style={styles.liveList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
        {amHost && players.length > 1 && !gameEnded ? (
          <Text style={[typography.caption, styles.hostHint, { color: colors.onSurfaceVariant }]}>
            Hai creato tu la partita: tocca un giocatore per rimuoverlo.
          </Text>
        ) : null}
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
                onPress={() => openModal('restaurant')}
                style={styles.flex}
              />
              <AppButton label="Nuova partita" icon="plus" onPress={goHome} style={styles.flex} />
            </View>
          </Panel>
        ) : null}
      </View>

      {/* Classifica finale */}
      <Sheet
        visible={modal === 'leaderboard'}
        onClose={closeModal}
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
                  <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
                    {plural(p.score, 'pezzo', 'pezzi')}
                  </Text>
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
              closeModal();
              afterModalClose(goHome);
            }}
          />
          <View style={styles.endButtons}>
            <AppButton
              label="Ristorante"
              icon="map-marker-outline"
              variant="outline"
              onPress={() => openModal('restaurant')}
              style={styles.flex}
            />
            <AppButton label="Chiudi" variant="ghost" onPress={closeModal} style={styles.flex} />
          </View>
        </View>
      </Sheet>

      {/* Nome del ristorante */}
      <Sheet visible={modal === 'restaurant'} onClose={closeModal} title="Dove avete mangiato?" kanji="店">
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
            Data: {SessionStorageService.formatDate(startedAt)}
          </Text>
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{winnerText}</Text>
        </View>
        <View style={styles.endButtons}>
          <AppButton label="Annulla" variant="ghost" onPress={closeModal} style={styles.flex} />
          <AppButton label="Salva" icon="check" onPress={saveRestaurant} style={styles.flex} />
        </View>
      </Sheet>

      {/* Invito */}
      <Sheet visible={modal === 'share'} onClose={closeModal} title="Invita amici" kanji="招待">
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

      {/* Conferme e avvisi */}
      <ConfirmSheet options={modal === 'confirm' ? dialog : null} onClose={closeModal} />

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
  // Nome della sessione e stato centrati tra i due pulsanti rotondi
  sessionChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionCode: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 1.2,
    textAlign: 'center',
    maxWidth: '100%',
  },
  sessionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  shrink: {
    flexShrink: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
  hostHint: {
    marginTop: 6,
    textAlign: 'center',
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
  finishSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginTop: 18,
  },
  finishStat: {
    flex: 1,
    alignItems: 'center',
  },
  finishValue: {
    fontFamily: fonts.black,
    fontSize: 30,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  finishDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
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
