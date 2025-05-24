import {z} from "zod";
import {current_user, realm} from "./state_data.ts";
import * as channel from "./channel.ts";

export interface CallMessage {
    type: 'offer' | 'answer' | 'ice-candidate' | 'end';
    from_user_id: number;
    to_user_id: number;
    data: any;
}

const call_response_schema = z.object({
    msg: z.string(),
    result: z.string(),
    url: z.string(),
});

export class ClickToCall {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private userId: string;
    private callId: string;

    constructor() {
        this.userId = current_user.user_id.toString();
        this.callId = this.generateCallId();
        this.initializePeerConnection();
    }

    private generateCallId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    private initializePeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                // Add more STUN/TURN servers as needed
            ]
        });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.displayRemoteStream();
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection?.connectionState === 'disconnected') {
                this.closeCall();
            }
        };
    }

    private async getLocalStream(): Promise<MediaStream> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            return stream;
        } catch (error) {
            throw new Error('Failed to access media devices: ' + error);
        }
    }

    async initiateCall(userId: string): Promise<void> {
        try {
            const stream = await this.getLocalStream();
            stream.getTracks().forEach(track => this.peerConnection?.addTrack(track, stream));

            const offer = await this.peerConnection?.createOffer();
            await this.peerConnection?.setLocalDescription(offer);

            const message: CallMessage = {
                type: 'offer',
                from_user_id: parseInt(this.userId),
                to_user_id: parseInt(userId),
                data: offer
            };

            this.sendMessage(message);
        } catch (error) {
            throw new Error('Failed to initiate call: ' + error);
        }
    }

    async acceptCall(offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            await this.peerConnection?.setRemoteDescription(offer);
            const answer = await this.peerConnection?.createAnswer();
            await this.peerConnection?.setLocalDescription(answer);

            const message: CallMessage = {
                type: 'answer',
                from_user_id: parseInt(this.userId),
                to_user_id: parseInt(this.userId),
                data: answer
            };

            this.sendMessage(message);
        } catch (error) {
            throw new Error('Failed to accept call: ' + error);
        }
    }

    private sendMessage(message: CallMessage): void {
        channel.post({
            url: '/json/calls/message',
            data: {
                message_type: 'call',
                call_id: this.callId,
                message: JSON.stringify(message)
            },
            success: () => {
                console.log('Message sent successfully');
            },
            error: (xhr) => {
                console.error('Failed to send message:', xhr.responseJSON);
            }
        });
    }

    private sendIceCandidate(candidate: RTCIceCandidate): void {
        const message: CallMessage = {
            type: 'ice-candidate',
            from_user_id: parseInt(this.userId),
            to_user_id: parseInt(this.userId),
            data: candidate
        };

        this.sendMessage(message);
    }

    private displayRemoteStream(): void {
        const videoElement = document.getElementById('remote-video') as HTMLVideoElement;
        if (videoElement && this.remoteStream) {
            videoElement.srcObject = this.remoteStream;
            videoElement.play().catch((error) => {
                console.error('Failed to play video:', error);
            });
        }
    }

    closeCall(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        // Send call end message
        const message: CallMessage = {
            type: 'end',
            from_user_id: parseInt(this.userId),
            to_user_id: parseInt(this.userId),
            data: null
        };

        this.sendMessage(message);
    }
}
}
