import path from 'path';
import { Container } from 'typedi';
import showrunnersHelper from './showrunnersHelper';
import epnsHelper from '@epnsproject/backend-sdk-staging';
import config, { SDKSettings } from '../config';
import { Logger } from 'winston';
import { ethers } from 'ethers';

export interface ChannelSettings {
  sdkSettings: SDKSettings;
  networkToMonitor: string;
  dirname: string;
  name: string;
  url: string;
  address?: string;
  useOffChain: boolean;
}

export interface ISendNotificationParams {
  recipient: string;
  title: string;
  message: string;
  payloadTitle: string;
  payloadMsg: string;
  notificationType: number;
  cta?: string;
  image: string;
  simulate: boolean | Object;
  offChain?: boolean;
  timestamp?: number;
  retry?: boolean;
}

export class EPNSChannel {
  constructor(public logger: Logger, cSettings: ChannelSettings) {
    this.cSettings = cSettings;
    this.init();
  }

  walletKey: string;
  channelAddress: string;
  epnsSDK: epnsHelper;
  cSettings: ChannelSettings;
  failedNotificationsModel: any;

  private async getWalletKey(dirname: string) {
    dirname = path.basename(dirname);
    this.logInfo('Getting WalletKey for %s', dirname);

    const wallets = config.showrunnerWallets[`${dirname}`];
    const currentWalletInfo = await showrunnersHelper.getValidWallet(dirname, wallets);

    this.logInfo('currentWalletInfo: %o', currentWalletInfo);
    const walletKeyID = `wallet${currentWalletInfo.currentWalletID}`;

    const walletKey = wallets[walletKeyID];
    this.logInfo('WalletKey Obtained');
    return walletKey.startsWith("0x") ? walletKey : `0x${walletKey}`;
  }

  //   Initialize and load this.cSettings
  async init() {
    this.logInfo('Initializing Channel : %s', this.cSettings.name);
    try {
      const sdkSettings = this.cSettings.sdkSettings;
      this.walletKey = await this.getWalletKey(this.cSettings.dirname);
      this.channelAddress = this.cSettings?.address ?? ethers.utils.computeAddress(this.walletKey);
      this.logInfo(`channelAddress : ${this.channelAddress}`);
      this.epnsSDK = new epnsHelper(this.walletKey, {
        channelAddress: this.channelAddress,
        networkKeys: sdkSettings.networkSettings,
        networkToMonitor: this.cSettings.networkToMonitor,
      });
      this.logInfo('Channel Initialization Complete');
    } catch (error) {
      this.logError(error);
    }
  }

  public get timestamp() {
    return Math.floor(Date.now() / 1000);
  }

  public async getSdk() {
    if (this.epnsSDK) {
      return this.epnsSDK;
    }
    await this.init();
    return this.epnsSDK;
  }

  //   --------------------------------------------------
  //   Logging Related
  //
  //
  private get logBase() {
    return `[${new Date(Date.now())}]-[${this.cSettings.name} Channel]- `;
  }

  public get blockNoKey() {
    return `${this.cSettings.name.toUpperCase()}_BLOCK_NO`;
  }

  public logInfo(msg: string, ...args: any[]) {
    this.logger.info(`${this.logBase} ${msg}`, ...args);
  }

  public log(msg: any) {
    this.logger.info(`${this.logBase} %o`, msg);
  }

  public logDebug(msg: string, ...args: any[]) {
    this.logger.debug(`${this.logBase} ${msg}`, ...args);
  }

  public logError(err) {
    this.logger.error(`${this.logBase} %o`, err);
  }

  //   ---------------------------------------------------

  //
  // Notification Related
  // ---------------------------------
  async sendNotification(params: ISendNotificationParams) {
    const isOffChain = params.offChain ?? this.cSettings.useOffChain ?? false;
    const globalRetryIfFailed = params.retry === undefined ? true : params.retry;
    try {
      const sdk = await this.getSdk();
      this.logInfo('------------------------');
      this.logInfo(`Sending Notification`);
      this.logInfo('------------------------');
      params.payloadMsg = params.payloadMsg + `[timestamp: ${params?.timestamp ?? this.timestamp}]`;
      const tx = await sdk.sendNotification(
        params.recipient,
        params.title,
        params.message,
        params.payloadTitle,
        params.payloadMsg,
        params.notificationType,
        params?.cta ?? this.cSettings?.url,
        params.image,
        params.simulate,
        {
          offChain: isOffChain,
        },
      );

      const { retry = false } = tx;
      // if its offchain and it fails then use retry logic
      if (isOffChain && retry && globalRetryIfFailed) {
        // if sending this notification fails for any reason then resend it
        this.saveFailedNotification(params);
        // if sending this notification fails for any reason then resend it
      }
      this.logInfo('transaction: %o', tx);
      return tx;
    } catch (error) {
      this.logError('Failed to send notification');
      if (isOffChain) {
        // if sending this notification fails for any reason then resend it
        this.saveFailedNotification(params);
        // if sending this notification fails for any reason then resend it
      }
      this.logError(error);
    }
  }
  /**
   * A method which would help persevere failed messages to the database
   */
  async saveFailedNotification(params: ISendNotificationParams) {
    try {
      const sdk = await this.getSdk();
      // get the model and create a new entry for the recently failed job
      params.payloadMsg = params.payloadMsg + `[timestamp: ${params?.timestamp ?? this.timestamp}]`;
      const notificationPayload = await sdk.sendNotification(
        params.recipient,
        params.title,
        params.message,
        params.payloadTitle,
        params.payloadMsg,
        params.notificationType,
        params?.cta ?? this.cSettings?.url,
        params.image,
        params.simulate,
        {
          offChain: true,
          returnPayload: true,
        },
      );

      this.failedNotificationsModel = Container.get('retryModel');
      // add extra check to prevent thrownig errors if a model is not present
      if (this.failedNotificationsModel) {
        const data = { payload: notificationPayload, lastAttempted: new Date() };
        await this.failedNotificationsModel.insertMany([data]);
      }
    } catch (err) {
      this.logError(err.message);
    }
  }
}
