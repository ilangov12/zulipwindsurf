import * as $ from "jquery";
import {z} from "zod";

import * as compose_call from "./compose_call.ts";
import * as rows from "./rows.ts";
import {current_user, realm} from "./state_data.ts";
import * as ui_report from "./ui_report.ts";
import {ClickToCall, generate_and_insert_audio_or_video_call_link} from "./click_to_call";

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

// Initialize click-to-call instance
let clickToCall: ClickToCall | null = null;

export function update_audio_and_video_chat_button_display(): void {
    const show_audio_chat_button = compose_call.compute_show_audio_chat_button();
    $(".compose-control-buttons-container .audio_link").toggle(show_audio_chat_button);
    $(".message-edit-feature-group .audio_link").toggle(show_audio_chat_button);

    const show_click_to_call_button = true;
    $(".compose-control-buttons-container .click_to_call").toggle(show_click_to_call_button);
    $(".message-edit-feature-group .click_to_call").toggle(show_click_to_call_button);

    if (!clickToCall) {
        clickToCall = new ClickToCall();
    }

    $(".click_to_call").click(async function() {
        const $target_element = $(this);
        const userId = getTargetUserId($target_element);
        if (userId) {
            try {
                await clickToCall?.initiateCall(userId);
            } catch (error) {
                ui_report.error("Failed to initiate call", error as Error);
            }
        }
    });
}

const call_response_schema = z.object({
    success: z.boolean(),
    error_msg: z.string().optional()
});

// Export the schema for use in other modules
export { call_response_schema };

// UI Logic is handled in update_audio_and_video_chat_button_display()

// No BigBlueButton or Jitsi integration needed for click-to-call feature
// All call functionality is handled by the ClickToCall class

// Keep only the essential functions for click-to-call feature
function getTargetUserId($element: JQuery): string | null {
    const messageRow = $element.closest(".message_row");
    if (messageRow.length > 0) {
        return rows.id(messageRow).toString();
    }
    return null;
}
