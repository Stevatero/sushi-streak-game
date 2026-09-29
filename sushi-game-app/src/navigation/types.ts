import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type GameSessionParams = {
  sessionId: string;
  sessionName: string;
  playerId: string;
  playerName: string;
  playerToken: string;
  isHost: boolean;
  // Inizio della partita secondo il server (assente con i server precedenti alla 1.7)
  sessionStartedAt?: number;
};

export type RootStackParamList = {
  Home: undefined;
  GameSession: GameSessionParams;
  Settings: undefined;
  SessionHistory: undefined;
};

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
