import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import useGameStore, { Player } from '../store/gameStore';
import SushiStack from '../components/SushiStack';
import SakuraCelebration from '../components/SakuraCelebration';
import InviteSheet from '../components/InviteSheet';
import ResultShareSheet from '../components/ResultShareSheet';
import SoundManager from '../utils/SoundManager';
import { haptics } from '../utils/haptics';
import { openAppStore } from '../utils/appStore';
import { plural } from '../utils/plural';
import { rankOf, sortByScore, winnerText, winnersOf } from '../utils/ranking';
import { SessionStorageService } from '../services/sessionStorage';
import { useExclusiveModal } from '../hooks/useExclusiveModal';
import type { RootNavigationProp, RootStackParamList } from '../navigation/types';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import ConfirmSheet, { ConfirmOptions } from '../components/ui/ConfirmSheet';
import FinalLeaderboardSheet from './gameSession/FinalLeaderboardSheet';
import GameControls from './gameSession/GameControls';
import GameTopBar from './gameSession/GameTopBar';
import LiveLeaderboard from './gameSession/LiveLeaderboard';
import RestaurantSheet from './gameSession/RestaurantSheet';
import ScoreHero from './gameSession/ScoreHero';
import { useHistoryAutosave } from './gameSession/useHistoryAutosave';

const CELEBRATION_DURATION_MS = 6000;

type GameModal = 'leaderboard' | 'restaurant' | 'share' | 'confirm' | 'result';

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
    closedBy,
    connection,
    status,
    features,
    pendingDelta,
    pendingCount,
    droppedPieces,
    startSession,
    addPiece,
    removePiece,
    finishGame,
    endSession,
    kickPlayer,
  } = useGameStore(
    useShallow((s) => ({
      players: s.players,
      hostId: s.hostId,
      gameEnded: s.gameEnded,
      endReason: s.endReason,
      closedBy: s.closedBy,
      connection: s.connection,
      status: s.status,
      features: s.features,
      pendingDelta: s.pendingDelta,
      pendingCount: s.pendingCount,
      droppedPieces: s.droppedPieces,
      startSession: s.startSession,
      addPiece: s.addPiece,
      removePiece: s.removePiece,
      finishGame: s.finishGame,
      endSession: s.endSession,
      kickPlayer: s.kickPlayer,
    }))
  );

  // Finestre modali: classifica, nome del ristorante, invito, risultato da condividere e conferme
  const { modal, openModal, closeModal, afterModalClose } = useExclusiveModal<GameModal>();
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [celebrationDone, setCelebrationDone] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  // Ristorante salvato (il campo può contenere modifiche non salvate): va nell'immagine del risultato
  const [savedRestaurant, setSavedRestaurant] = useState('');
  const [snackbar, setSnackbar] = useState('');

  // Inizio della partita: il ref serve ai callback, lo stato alla visualizzazione
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const startedAtRef = useRef(startedAt);
  const restaurantRef = useRef('');
  // true quando il giocatore ha salvato il ristorante in questa schermata (anche vuoto)
  const restaurantEditedRef = useRef(false);
  const allowExitRef = useRef(false);
  const endHandledRef = useRef(false);
  // Salvataggio iniziale della sessione attiva: la pulizia di fine partita deve avvenire dopo
  const activeSavedRef = useRef<Promise<void>>(Promise.resolve());
  // L'avviso "pezzi inviati alla riconnessione" compare una sola volta
  const offlineNoticeRef = useRef(false);
  const pendingCountRef = useRef(pendingCount);
  useEffect(() => {
    pendingCountRef.current = pendingCount;
  }, [pendingCount]);

  const me = players.find((p) => p.id === playerId);
  // Il proprio punteggio comprende i pezzi registrati sul telefono e non ancora confermati dal server
  const myScore = Math.max(0, (me?.score ?? 0) + pendingDelta);
  const rankedPlayers = useMemo(
    () => players.map((p) => (p.id === playerId ? { ...p, score: myScore } : p)),
    [players, playerId, myScore]
  );
  const sortedPlayers = useMemo(() => sortByScore(rankedPlayers), [rankedPlayers]);
  const myRank = me ? rankOf(rankedPlayers, myScore) : 0;
  const iWon = useMemo(() => winnersOf(sortedPlayers).some((p) => p.id === playerId), [sortedPlayers, playerId]);
  const resultText = winnerText(sortedPlayers);
  const hasFinished = finishRequested || !!me?.finished;
  const isOnline = connection === 'connected';
  // Con un server 1.8+ i pezzi si registrano anche offline e partono alla riconnessione
  const canQueue = features.pieceQueue;
  // Solo con un server che indica l'host (1.3+) si possono rimuovere i giocatori
  const amHost = !!hostId && hostId === playerId;
  const canShare = status === 'active' && !gameEnded;
  // Petali di ciliegio per chi vince, per qualche secondo dopo la fine della partita
  const showCelebration = gameEnded && endReason === 'ended' && iWon && !celebrationDone;
  const endNote =
    closedBy === 'host'
      ? 'Chiusa da chi gestiva la partita.'
      : closedBy === 'auto'
        ? 'Chiusa automaticamente dopo un po’ senza nuovi pezzi.'
        : undefined;
  const excludedFromHistory =
    endReason === 'kicked' ||
    endReason === 'unauthorized' ||
    endReason === 'not_found' ||
    endReason === 'upgrade_required';

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
        setSavedRestaurant(record.restaurant);
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
      const unsent = pendingCountRef.current;
      showDialog({
        seal: '帰',
        kanji: 'またね',
        title: 'Uscire dalla partita?',
        message:
          unsent > 0
            ? `Attenzione: ${plural(unsent, 'tocco non ancora inviato', 'tocchi non ancora inviati')} al server andrà perso. Gli altri pezzi restano salvati e potrai rientrare dalla Home.`
            : 'I tuoi pezzi restano salvati: potrai rientrare dalla Home finché la sessione è attiva.',
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

  const persistResult = useHistoryAutosave({
    sessionId,
    sessionName,
    players,
    hasFinished,
    gameEnded,
    excluded: excludedFromHistory,
    startedAtRef,
    restaurantRef,
    restaurantEditedRef,
    activeSavedRef,
    onError: setSnackbar,
  });

  // Gestione della fine partita (tutti hanno finito, chiusura, scadenza, credenziali non valide o app da
  // aggiornare): reazione, una sola volta, all'evento del server, che apre la finestra con l'esito
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!gameEnded || endHandledRef.current) return;
    endHandledRef.current = true;
    // Con un aggiornamento richiesto la partita resta riprendibile dalla Home, dopo l'aggiornamento
    if (endReason !== 'upgrade_required') {
      activeSavedRef.current.then(() => SessionStorageService.clearActiveSession());
    }

    // Le finestre ancora aperte (es. una conferma) lasciano il posto all'esito della partita
    const leaveGame = () => afterModalClose(goHome);
    if (endReason === 'ended') {
      openModal('leaderboard');
      if (iWon) {
        SoundManager.playVictorySound();
        haptics.success();
      }
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
        message: 'Chi gestisce la partita ti ha tolto dalla classifica.',
        confirmLabel: 'Torna alla Home',
        confirmIcon: 'home-outline',
        dismissable: false,
        onConfirm: leaveGame,
        onCancel: leaveGame,
      });
    } else if (endReason === 'upgrade_required') {
      showDialog({
        seal: '新',
        title: 'Aggiorna Sushi Streak',
        message:
          "È disponibile una nuova versione dell'app: aggiornala per continuare a giocare. I tuoi pezzi restano salvati e potrai rientrare nella partita dalla Home.",
        confirmLabel: "Aggiorna l'app",
        confirmIcon: 'download',
        cancelLabel: 'Torna alla Home',
        dismissable: false,
        onConfirm: () => {
          openAppStore();
          leaveGame();
        },
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

  // Pezzi in attesa che il server non ha più accettato (es. partita chiusa mentre si era offline)
  useEffect(() => {
    if (!droppedPieces) return;
    setSnackbar(
      droppedPieces.count === 1
        ? '1 tocco non è stato registrato: la partita non lo accettava più'
        : `${droppedPieces.count} tocchi non sono stati registrati: la partita non li accettava più`
    );
  }, [droppedPieces]);

  // Il ruolo di host passa a questo giocatore (l'host era assente da un po')
  const previousHostRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousHostRef.current;
    previousHostRef.current = hostId;
    if (previous && previous !== playerId && hostId === playerId && !gameEnded) {
      setSnackbar('Ora gestisci tu la partita: puoi rimuovere giocatori e terminarla');
    }
  }, [hostId, playerId, gameEnded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lettori di schermo: annuncio dei cambi di posizione in classifica
  const previousRankRef = useRef(0);
  useEffect(() => {
    const previous = previousRankRef.current;
    previousRankRef.current = myRank;
    if (previous > 0 && myRank > 0 && previous !== myRank && !gameEnded) {
      AccessibilityInfo.announceForAccessibility(`Sei ${myRank}° su ${players.length}`);
    }
  }, [myRank, players.length, gameEnded]);

  const handleAddPiece = async () => {
    if (!isOnline && !canQueue) {
      setSnackbar('Sei offline: attendi la riconnessione');
      return;
    }
    SoundManager.playPieceSound();
    haptics.piece();

    const res = await addPiece();
    if (!res.ok) {
      setSnackbar(
        res.code === 'rate_limited' ? 'Troppo veloce: pezzo non contato' : res.error || 'Pezzo non registrato'
      );
      return;
    }
    if (res.queued && !offlineNoticeRef.current) {
      offlineNoticeRef.current = true;
      setSnackbar('Sei offline: i pezzi verranno inviati appena torni online');
    }
  };

  const handleRemovePiece = async () => {
    const res = await removePiece();
    // Il "bop" accompagna la scomparsa del pezzo dalla pila
    if (res.ok) {
      SoundManager.playUndoSound();
      haptics.undo();
    }
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

  // L'host chiude la partita per tutti, ad esempio se qualcuno si è dimenticato di toccare "Ho finito"
  const confirmEndSession = () => {
    // Gli altri giocatori che non hanno ancora finito: per nome se sono pochi
    const waiting = players.filter((p) => !p.finished && p.id !== playerId).map((p) => p.name);
    const names =
      waiting.length > 3
        ? `${waiting.length} giocatori`
        : waiting.length > 1
          ? `${waiting.slice(0, -1).join(', ')} e ${waiting[waiting.length - 1]}`
          : waiting[0];
    const message =
      waiting.length === 0
        ? 'Comparirà il podio con la classifica finale.'
        : waiting.length === 1
          ? `${names} non ha ancora finito: verrà segnato come finito con i pezzi che ha e comparirà il podio.`
          : `${names} non hanno ancora finito: verranno segnati come finiti con i pezzi che hanno e comparirà il podio.`;
    showDialog({
      seal: '終',
      kanji: 'おしまい',
      title: 'Terminare la partita per tutti?',
      message,
      confirmLabel: 'Termina la partita',
      confirmIcon: 'flag-checkered',
      destructive: true,
      cancelLabel: 'Annulla',
      onConfirm: async () => {
        const res = await endSession();
        if (!res.ok) setSnackbar(res.error || 'Impossibile terminare la partita');
      },
    });
  };

  const saveRestaurant = async () => {
    restaurantRef.current = restaurantName.trim();
    restaurantEditedRef.current = true;
    setSavedRestaurant(restaurantRef.current);
    await persistResult(useGameStore.getState().players);
    closeModal();
    setSnackbar('Partita salvata nello storico');
  };

  const connectionLabel = isOnline ? 'Online' : connection === 'connecting' ? 'Riconnessione…' : 'Offline';
  const statusLabel =
    !isOnline && pendingCount > 0 ? `${connectionLabel} · ${pendingCount} da inviare` : connectionLabel;
  const connectionColor = isOnline ? colors.tertiary : connection === 'connecting' ? colors.gold : colors.error;
  const dateLabel = SessionStorageService.formatDate(startedAt);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SushiStack pieceCount={myScore} />
      {/* Con la classifica finale aperta i petali cadono sopra il pannello */}
      <SakuraCelebration isVisible={showCelebration && modal !== 'leaderboard'} />

      <GameTopBar
        title={sessionName || sessionId}
        status={statusLabel}
        statusColor={connectionColor}
        onShare={canShare ? () => openModal('share') : undefined}
        onBack={() => navigation.goBack()}
        onSettings={() => navigation.navigate('Settings')}
        topInset={insets.top}
      />

      {!isOnline && !gameEnded ? (
        <View style={[styles.connectionBanner, { backgroundColor: colors.errorContainer }]}>
          <MaterialCommunityIcons
            name={connection === 'connecting' ? 'wifi-sync' : 'wifi-off'}
            size={16}
            color={colors.onErrorContainer}
          />
          <Text style={[typography.caption, styles.shrink, { color: colors.onErrorContainer }]}>
            {connection === 'connecting' ? 'Riconnessione in corso…' : 'Non connesso al server'}
            {canQueue ? ' · i pezzi partono appena torni online' : ''}
          </Text>
        </View>
      ) : null}

      <ScoreHero score={myScore} rank={myRank} playersCount={players.length} />

      <LiveLeaderboard
        players={sortedPlayers}
        playerId={playerId}
        hostId={hostId}
        onKick={amHost && !gameEnded ? confirmKick : undefined}
        onEndSession={amHost && features.endSession && !gameEnded ? confirmEndSession : undefined}
      />

      <View style={styles.flex} pointerEvents="none" />

      <GameControls
        state={gameEnded ? 'ended' : hasFinished ? 'finished' : 'playing'}
        bottomInset={insets.bottom}
        canUndo={myScore > 0 && (isOnline || canQueue)}
        dimmed={!isOnline && !canQueue}
        onAdd={handleAddPiece}
        onUndo={handleRemovePiece}
        onFinish={handleFinish}
        endTitle={endReason === 'expired' ? 'Sessione scaduta' : 'Partita terminata!'}
        endMessage={resultText}
        endNote={endNote}
        iWon={iWon}
        onShareResult={() => openModal('result')}
        onRestaurant={() => openModal('restaurant')}
        onNewGame={goHome}
      />

      <FinalLeaderboardSheet
        visible={modal === 'leaderboard'}
        onClose={closeModal}
        gameEnded={gameEnded}
        players={sortedPlayers}
        playerId={playerId}
        hostId={hostId}
        winnerText={winnersOf(sortedPlayers).length > 0 ? resultText : null}
        endNote={endNote}
        overlay={<SakuraCelebration isVisible={showCelebration} />}
        onShareResult={() => openModal('result')}
        onRestaurant={() => openModal('restaurant')}
        onNewGame={() => {
          closeModal();
          afterModalClose(goHome);
        }}
      />

      <RestaurantSheet
        visible={modal === 'restaurant'}
        onClose={closeModal}
        value={restaurantName}
        onChange={setRestaurantName}
        onSave={saveRestaurant}
        sessionName={sessionName}
        dateLabel={dateLabel}
        winnerText={resultText}
      />

      <InviteSheet
        visible={modal === 'share'}
        onClose={closeModal}
        sessionId={sessionId}
        sessionName={sessionName}
        onResult={setSnackbar}
      />

      <ResultShareSheet
        visible={modal === 'result'}
        onClose={closeModal}
        result={{
          sessionName: sessionName || sessionId,
          dateLabel,
          restaurant: savedRestaurant,
          players: sortedPlayers,
        }}
        onError={setSnackbar}
      />

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
  shrink: {
    flexShrink: 1,
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
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
  snackbar: {
    marginHorizontal: 16,
  },
});

export default GameSessionScreen;
