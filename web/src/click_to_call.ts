import * as channel from "./channel";
import {current_user} from "./state_data";
import * as rows from "./rows";
import * as ui_report from "./ui_report";
import z from "zod";

// Type definitions for jQuery
declare global {
    interface Window {
        $: typeof jQuery;
    }
    interface JQuery {
        closest(selector: string): JQuery;
        parents(selector: string): JQuery;
        data(key: string): any;
        event: any;
    }
}

// Call message type
type CallMessage = {
    type: 'offer' | 'answer' | 'ice-candidate' | 'end';
    from_user_id: number;
    to_user_id: number;
    data: any;
};

// Zod schema for call response
const call_response_schema = z.object({
    msg: z.string(),
    result: z.string(),
    url: z.string(),
});

// Zod schema for call message
const call_message_schema = z.object({
    type: z.enum(['offer', 'answer', 'ice-candidate', 'end']),
    from_user_id: z.number(),
    to_user_id: z.number(),
    data: z.any()
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

    static generate_and_insert_audio_or_video_call_link(userId: string): string {
        const callLink = `<a href="#" class="click_to_call" data-user-id="${userId}">Call</a>`;
        return callLink;
    }

    static call_response_schema = z.object({
        type: z.enum(['offer', 'answer', 'ice-candidate', 'end']),
        from_user_id: z.number(),
        to_user_id: z.number(),
        data: z.any()
    });

    private generateCallId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    private initializePeerConnection(): void {
        if (!this.peerConnection) {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            this.peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
                if (event.candidate) {
                    this.sendIceCandidate(event.candidate);
                }
            };

            this.peerConnection.ontrack = (event: RTCTrackEvent) => {
                this.remoteStream = event.streams[0];
                this.displayRemoteStream();
            };

            this.peerConnection.onconnectionstatechange = () => {
                if (this.peerConnection?.connectionState === 'disconnected') {
                    this.closeCall();
                }
            };
        }
    }

    private async getLocalStream(): Promise<MediaStream> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            return stream;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('Failed to access media devices: ' + error.message);
            }
            throw new Error('Failed to access media devices: Unknown error');
        }
    }

    async initCall(userId: string): Promise<void> {
        try {
            const stream = await this.getLocalStream();
            if (this.peerConnection) {
                stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                const message: CallMessage = {
                    type: 'offer',
                    from_user_id: parseInt(this.userId),
                    to_user_id: parseInt(userId),
                    data: offer
                };

                this.sendMessage(message);
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('Failed to initialize call: ' + error.message);
            }
            throw new Error('Failed to initialize call: Unknown error');
        }
    }

    async acceptCall(userId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

                const stream = await this.getLocalStream();
                stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));

                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                const message: CallMessage = {
                    type: 'answer',
                    from_user_id: parseInt(this.userId),
                    to_user_id: parseInt(userId),
                    data: answer
                };

                this.sendMessage(message);
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('Failed to accept call: ' + error.message);
            }
            throw new Error('Failed to accept call: Unknown error');
        }
    }

    private sendMessage(message: CallMessage): void {
        if (message) {
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
                error: (xhr: JQuery.jqXHR) => {
                    console.error('Failed to send message:', xhr.responseJSON);
                }
            });
        }
    }

    private sendIceCandidate(candidate: RTCIceCandidate): void {
        if (candidate) {
            const message: CallMessage = {
                type: 'ice-candidate',
                from_user_id: parseInt(this.userId),
                to_user_id: parseInt(this.userId),
                data: candidate
            };

            this.sendMessage(message);
        }
    }

    private displayRemoteStream(): void {
        if (this.remoteStream) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(this.remoteStream);
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
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

        const message: CallMessage = {
            type: 'end',
            from_user_id: parseInt(this.userId),
            to_user_id: parseInt(this.userId),
            data: null
        };

        this.sendMessage(message);
    }
}
