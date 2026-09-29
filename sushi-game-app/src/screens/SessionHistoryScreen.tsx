import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { IconButton, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { plural } from '../utils/plural';
import { SessionStorageService, SavedSession } from '../services/sessionStorage';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import { useExclusiveModal } from '../hooks/useExclusiveModal';
import AppButton from '../components/ui/AppButton';
import ConfirmSheet, { ConfirmOptions } from '../components/ui/ConfirmSheet';
import Hanko from '../components/ui/Hanko';
import Panel from '../components/ui/Panel';
import ScreenHeader from '../components/ui/ScreenHeader';
import SectionTitle from '../components/ui/SectionTitle';
import Seigaiha from '../components/ui/Seigaiha';
import Sheet from '../components/ui/Sheet';

const MONTHS = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];

const SessionHistoryScreen = () => {
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  // La partita selezionata resta impostata anche a finestra chiusa, per la dissolvenza di chiusura
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null);
  const { modal, openModal, closeModal } = useExclusiveModal<'detail' | 'confirm'>();
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [snackbar, setSnackbar] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSavedSessions = async () => {
    try {
      const sessions = await SessionStorageService.getSavedSessions();
      setSavedSessions(sessions);
    } catch {
      setSnackbar('Impossibile caricare le partite salvate');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Caricamento asincrono dallo storage: gli stati si aggiornano solo dopo la lettura
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSavedSessions();
  }, []);

  const deleteSession = (session: SavedSession) => {
    setDialog({
      seal: '消',
      title: 'Eliminare la partita?',
      message: `"${session.sessionName}" verrà tolta dallo storico di questo dispositivo.`,
      confirmLabel: 'Elimina',
      confirmIcon: 'trash-can-outline',
      destructive: true,
      cancelLabel: 'Annulla',
      onConfirm: async () => {
        try {
          await SessionStorageService.deleteSession(session.id);
          await loadSavedSessions();
          setSnackbar('Partita eliminata');
        } catch {
          setSnackbar('Impossibile eliminare la partita');
        }
      },
    });
    openModal('confirm');
  };

  const showDetail = (session: SavedSession) => {
    setSelectedSession(session);
    openModal('detail');
  };

  const stats = useMemo(() => {
    let pieces = 0;
    let record = 0;
    for (const s of savedSessions) {
      for (const p of s.players) {
        pieces += p.score;
        record = Math.max(record, p.score);
      }
    }
    return { games: savedSessions.length, pieces, record };
  }, [savedSessions]);

  const renderDate = (value: string) => {
    const date = SessionStorageService.parseDate(value);
    return (
      <View style={[styles.dateBlock, { backgroundColor: colors.primaryContainer }]}>
        {date ? (
          <>
            <Text style={[styles.dateDay, { color: colors.onPrimaryContainer }]}>{date.getDate()}</Text>
            <Text style={[styles.dateMonth, { color: colors.onPrimaryContainer }]}>{MONTHS[date.getMonth()]}</Text>
          </>
        ) : (
          <MaterialCommunityIcons name="calendar-blank" size={22} color={colors.onPrimaryContainer} />
        )}
      </View>
    );
  };

  const renderSessionItem = ({ item }: { item: SavedSession }) => (
    <Pressable onPress={() => showDetail(item)} accessibilityRole="button">
      {({ pressed }) => (
        <Panel style={[styles.sessionCard, pressed && { opacity: 0.85 }]}>
          <View style={styles.sessionRow}>
            {renderDate(item.date)}
            <View style={styles.sessionInfo}>
              <Text style={[typography.subtitle, { color: colors.onSurface }]} numberOfLines={1}>
                {item.sessionName}
              </Text>
              {item.restaurant ? (
                <View style={styles.inline}>
                  <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.secondary} />
                  <Text style={[typography.caption, { color: colors.secondary }]} numberOfLines={1}>
                    {item.restaurant}
                  </Text>
                </View>
              ) : null}
              <View style={styles.inline}>
                <Hanko label="勝" size={18} tilt={0} color={colors.gold} />
                <Text style={[typography.caption, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                  {item.winner.name} · {plural(item.winner.score, 'pezzo', 'pezzi')} ·{' '}
                  {plural(item.players.length, 'giocatore', 'giocatori')}
                  {item.duration ? ` · ${item.duration}` : ''}
                </Text>
              </View>
            </View>
            <IconButton
              icon="trash-can-outline"
              accessibilityLabel="Elimina partita"
              size={20}
              iconColor={colors.onSurfaceVariant}
              onPress={() => deleteSession(item)}
              style={styles.deleteButton}
            />
          </View>
        </Panel>
      )}
    </Pressable>
  );

  const renderStat = (value: number, label: string) => (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.onSurface }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Storico partite" kanji="履歴" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.centered}>
          <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>Caricamento...</Text>
        </View>
      ) : savedSessions.length === 0 ? (
        <View style={styles.centered}>
          <Seigaiha style={styles.emptyPattern} />
          <Hanko label="空" size={64} color={colors.surfaceVariant} textColor={colors.onSurfaceVariant} />
          <Text style={[typography.subtitle, styles.emptyTitle, { color: colors.onSurface }]}>
            Nessuna partita salvata
          </Text>
          <Text style={[typography.body, styles.emptyText, { color: colors.onSurfaceVariant }]}>
            Le partite che giocherai appariranno qui, con classifica e ristorante.
          </Text>
        </View>
      ) : (
        <FlatList
          data={savedSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSessionItem}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 24 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Panel style={styles.statsPanel}>
              {renderStat(stats.games, stats.games === 1 ? 'partita' : 'partite')}
              <View style={[styles.statDivider, { backgroundColor: colors.outlineVariant }]} />
              {renderStat(stats.pieces, stats.pieces === 1 ? 'pezzo mangiato' : 'pezzi mangiati')}
              <View style={[styles.statDivider, { backgroundColor: colors.outlineVariant }]} />
              {renderStat(stats.record, 'record')}
            </Panel>
          }
        />
      )}

      {/* Dettaglio partita */}
      <Sheet visible={modal === 'detail'} onClose={closeModal} title={selectedSession?.sessionName} kanji="結果">
        {selectedSession ? (
          <>
            <View style={[styles.detailBox, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.inline}>
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.onSurfaceVariant} />
                <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>
                  {selectedSession.restaurant || 'Ristorante non indicato'}
                </Text>
              </View>
              <View style={styles.inline}>
                <MaterialCommunityIcons name="calendar-outline" size={16} color={colors.onSurfaceVariant} />
                <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>
                  {SessionStorageService.formatDate(selectedSession.date)}
                  {selectedSession.duration ? ` · ${selectedSession.duration}` : ''}
                </Text>
              </View>
            </View>

            <SectionTitle label="Classifica finale" kanji="順位" style={styles.detailTitle} />
            <FlatList
              data={selectedSession.players}
              keyExtractor={(item) => item.id}
              style={styles.leaderboardList}
              renderItem={({ item }) => {
                const rank = 1 + selectedSession.players.filter((p) => p.score > item.score).length;
                const medal = rank === 1 ? colors.gold : rank === 2 ? colors.silver : rank === 3 ? colors.bronze : null;
                return (
                  <View style={styles.playerRow}>
                    <Hanko
                      label={String(rank)}
                      size={28}
                      shape="circle"
                      tilt={0}
                      color={medal ?? colors.surfaceVariant}
                      textColor={medal ? '#FFFFFF' : colors.onSurfaceVariant}
                    />
                    <Text style={[styles.playerName, { color: colors.onSurface }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.playerScore, { color: colors.onSurface }]}>{item.score}</Text>
                  </View>
                );
              }}
            />
            <AppButton label="Chiudi" variant="tonal" onPress={closeModal} />
          </>
        ) : null}
      </Sheet>

      <ConfirmSheet options={modal === 'confirm' ? dialog : null} onClose={closeModal} />

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={2500}
        style={[styles.snackbar, { marginBottom: insets.bottom + 8 }]}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyPattern: {
    ...StyleSheet.absoluteFill,
  },
  emptyTitle: {
    marginTop: 20,
    marginBottom: 6,
  },
  emptyText: {
    textAlign: 'center',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  statsPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingVertical: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.black,
    fontSize: 26,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  sessionCard: {
    marginBottom: 12,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dateBlock: {
    width: 52,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontFamily: fonts.black,
    fontSize: 22,
    lineHeight: 24,
  },
  dateMonth: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  sessionInfo: {
    flex: 1,
    gap: 4,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  deleteButton: {
    margin: 0,
  },
  detailBox: {
    borderRadius: radii.md,
    padding: 14,
    gap: 8,
    marginBottom: 18,
  },
  detailTitle: {
    marginBottom: 6,
  },
  leaderboardList: {
    maxHeight: 260,
    marginBottom: 16,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  playerName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  playerScore: {
    fontFamily: fonts.bold,
    fontSize: 17,
  },
  snackbar: {
    marginHorizontal: 16,
  },
});

export default SessionHistoryScreen;
