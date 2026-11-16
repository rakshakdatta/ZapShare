import * as QRCode from 'qrcode';

export class QrService {
  async generateDataURL(peerId: string): Promise<string> {
    const qrData = `zapshare://connect/${peerId}`;
    return QRCode.toDataURL(qrData);
  }

  async generateImageBuffer(peerId: string): Promise<Buffer> {
    const qrData = `zapshare://connect/${peerId}`;
    return QRCode.toBuffer(qrData);
  }
}
