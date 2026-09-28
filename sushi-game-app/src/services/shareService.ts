import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PUBLIC_URL } from '../config';
import { api, ApiError, SessionInfo } from './api';
import { logger } from '../utils/logger';

export type SessionInfoResult =
  { status: 'ok'; info: SessionInfo } | { status: 'not_found' } | { status: 'error'; message: string };

export type ShareResult = 'shared' | 'dismissed' | 'error';

class ShareService {
  generateShareLink(sessionId: string): string {
    return `${PUBLIC_URL}/join/${encodeURIComponent(sessionId)}`;
  }

  generateDeepLink(sessionId: string): string {
    return `sushi-streak://join/${encodeURIComponent(sessionId)}`;
  }

  // Distingue "sessione inesistente" da "server non raggiungibile"
  async getSessionInfo(sessionId: string): Promise<SessionInfoResult> {
    try {
      return { status: 'ok', info: await api.getSessionInfo(sessionId) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { status: 'not_found' };
      return { status: 'error', message: error instanceof Error ? error.message : 'Errore sconosciuto' };
    }
  }

  async shareSession(sessionId: string, sessionName: string): Promise<ShareResult> {
    const result = await this.getSessionInfo(sessionId);
    const shareLink = this.generateShareLink(sessionId);
    const message =
      result.status === 'ok'
        ? this.createShareMessage(result.info, shareLink)
        : `🍣 Unisciti alla mia partita "${sessionName}" su Sushi Streak!\n\nCodice: ${sessionId}\n🔗 ${shareLink}`;

    try {
      // Il link è già nel messaggio: passarlo anche come "url" su iOS lo duplicherebbe (es. WhatsApp)
      const shareResult = await Share.share({
        message,
        title: `🍣 Unisciti a "${sessionName}" su Sushi Streak!`,
      });
      return shareResult.action === Share.dismissedAction ? 'dismissed' : 'shared';
    } catch (error) {
      logger.warn('Condivisione non riuscita', error);
      return 'error';
    }
  }

  async copySessionCode(sessionId: string): Promise<boolean> {
    try {
      await Clipboard.setStringAsync(sessionId);
      return true;
    } catch (error) {
      logger.warn('Copia del codice non riuscita', error);
      return false;
    }
  }

  private createShareMessage(sessionInfo: SessionInfo, shareLink: string): string {
    const statusEmoji = sessionInfo.isActive ? '🟢' : '🔴';
    const statusText = sessionInfo.isActive ? 'Attiva' : 'Terminata';

    let message = `🍣 Sushi Streak - Unisciti alla partita!\n\n`;
    message += `📋 Sessione: ${sessionInfo.sessionName}\n`;
    message += `🔑 Codice: ${sessionInfo.sessionId}\n`;
    message += `${statusEmoji} Stato: ${statusText}\n`;
    message += `👥 Giocatori: ${sessionInfo.playersCount}\n\n`;

    if (sessionInfo.players.length > 0) {
      message += `🏆 Classifica:\n`;
      [...sessionInfo.players]
        .sort((a, b) => b.score - a.score)
        .forEach((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
          const finishedIcon = player.finished ? ' ✅' : '';
          message += `${medal} ${player.name}: ${player.score} 🍣${finishedIcon}\n`;
        });
      message += `\n`;
    }

    message += sessionInfo.isActive ? `🎮 Apri il link per unirti alla partita!\n` : `📊 Guarda i risultati finali!\n`;
    message += `🔗 ${shareLink}`;
    return message;
  }
}

export const shareService = new ShareService();
export default shareService;
