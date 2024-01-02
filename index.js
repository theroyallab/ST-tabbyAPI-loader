import { extension_settings } from '../../../extensions.js';
import { callPopup, getRequestHeaders, online_status, saveSettingsDebounced } from '../../../../script.js';
import { textgen_types, textgenerationwebui_settings } from '../../../textgen-settings.js';
import { findSecret } from '../../../secrets.js';
import EventSourceStream from '../../../sse-stream.js';

const extensionName = 'ST-tabbyAPI-loader';
// Used for settings
const settingsName = 'tabbyLoader';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[settingsName];
const defaultSettings = {};

// TODO: Make a common tabbyRequest function

// Cached models list
let models = [];
let draftModels = [];

// Check if user is connected to TabbyAPI
function verifyTabby(logError = true) {
    const result = online_status !== 'no_connection' || textgenerationwebui_settings.type === textgen_types.TABBY;
    if (!result && logError) {
        toastr.error('TabbyLoader: Please connect to a TabbyAPI instance to use this extension');
    }

    return result;
}

// Fetch a cleaned URL
// Use the override if specified
function getTabbyURL() {
    const apiUrl = $('#tabby_api_url_text').val();
    let url = extensionSettings?.urlOverride ? extensionSettings.urlOverride : apiUrl;
    if (extensionSettings?.useProxy) {
        url = `/proxy/${url}`;
    }

    return url.replace(/\/$/, '');
}

// Fetch the TabbyAPI admin key if present
// TODO: Add check to see if the key has admin permissions
async function getTabbyAuth() {
    // In localStorage? Return it.
    let authToken = localStorage.getItem('Tabby_Admin');

    // Not in localStorage? Try secrets
    if (!authToken) {
        console.warn('TabbyLoader: Could not find your TabbyAPI admin key in localStorage, attempting to fetch from secrets...');

        try {
            authToken = await findSecret('api_key_tabby');
        } catch (error) {
            console.error(`TabbyLoader: ${error}`);
            console.error('Admin key error: Please make sure allowKeysExposure is true in config.conf and an API key is set for TabbyAPI.');
        }
    }

    // If a failure on both fronts
    if (!authToken) {
        console.error(
            'TabbyLoader: Admin key not found.',
            'Please make sure allowKeysExposure is true in config.conf if fetching from secrets.',
        );
    }

    return authToken;
}

// Fetch the model list for autocomplete population
async function fetchModels() {
    if (!verifyTabby(false)) {
        console.error('TabbyLoader: Could not connect to TabbyAPI');
        return;
    }
    var models, draftModels;
    // Remove trailing URL slash
    const apiUrl = getTabbyURL();
    try {
        const authToken = await getTabbyAuth();
        if (!authToken) {
            return;
        }

        const response = await fetch(`${apiUrl}/v1/model/list`, {
            headers: {
                'X-api-key': authToken,
            },
        });

        if (response.ok) {
            models = await response.json();
        } else {
            console.error(`Request to /v1/model/list failed with a statuscode of ${response.status}:\n${response.statusText}`);
            return [];
        }

        const draftModelListResponse = await fetch(`${apiUrl}/v1/model/draft/list`, {
            headers: {
                'X-api-key': authToken,
            },
        });

        if (draftModelListResponse.ok) {
            draftModels = await draftModelListResponse.json();
        } else {
            console.error(`Request to /v1/model/list failed with a statuscode of ${response.status}:\n${response.statusText}`);
            return [];
        }
        return [models.data.map((e) => e.id), draftModels.data.map((e) => e.id)];
    } catch (error) {
        console.error(error);

        return [];
    }
}

// This function is called when the button is clicked
async function onLoadModelClick() {
    if (!verifyTabby()) {
        return;
    }

    const modelValue = $('#model_list').val();
    const draftModelValue = $('#draft_model_list').val();

    if (!modelValue || !models.includes(modelValue)) {
        toastr.error('TabbyLoader: Please make sure the model name is spelled correctly before loading!');

        return;
    }

    if (draftModelValue !== '' && !models.includes(draftModelValue)) {
        toastr.error('TabbyLoader: Please make sure the draft model name is spelled correctly before loading!');
        return;
    }

    const tabbyURL = getTabbyURL();

    const body = {
        name: modelValue,
        max_seq_len: extensionSettings?.modelParams?.maxSeqLen,
        rope_scale: extensionSettings?.modelParams?.ropeScale,
        rope_alpha: extensionSettings?.modelParams?.ropeAlpha,
        no_flash_attention: extensionSettings?.modelParams?.noFlashAttention,
        gpu_split_auto: extensionSettings?.modelParams?.gpuSplitAuto,
        cache_mode: extensionSettings?.modelParams?.eightBitCache ?? false ? 'FP8' : 'FP16',
    };

    if (draftModelValue) {
        body.draft = {
            draft_model_name: draftModelValue,
            draft_rope_scale: extensionSettings?.modelParams?.draft.draft_ropeAlpha,
            draft_rope_alpha: extensionSettings?.modelParams?.draft.draft_ropeScale,
        };
    }

    if (!body.gpu_split_auto) {
        // TODO: Add a check for an empty array here
        const gpuSplit = extensionSettings?.modelParams?.gpuSplit;

        if (Array.isArray(gpuSplit) && gpuSplit?.length > 0) {
            body['gpu_split'] = gpuSplit;
        } else {
            console.error(`TabbyLoader: GPU split ${gpuSplit} is invalid. Set to auto or adjust your parameters!`);
            toastr.error('TabbyLoader: Invalid GPU split. Set GPU split to auto or adjust your parameters');
        }
    }

    const authToken = await getTabbyAuth();
    if (!authToken) {
        // eslint-disable-next-line
        toastr.error("TabbyLoader: Admin key not found. Please provide one in SillyTavern's model settings or in the extension box.");

        return;
    }
    console.log(body);
    try {
        const response = await fetch(`${tabbyURL}/v1/model/load`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                ...getRequestHeaders(),
                'X-admin-key': authToken,
            },
            body: JSON.stringify(body),
        });

        console.log(response);
        if (response.ok) {
            const eventStream = new EventSourceStream();
            response.body.pipeThrough(eventStream);
            const reader = eventStream.readable.getReader();
            const progressContainer = $('#loading_progress_container').hide();
            progressContainer.show();
            let soFar = 0;
            let times;
            draftModelValue ? times = 2 : times = 1;
            while (true) {
                const { value, done } = await reader.read();
                console.log(soFar, times);
                if (done && soFar === times) break;

                const packet = JSON.parse(value.data);
                const numerator = parseInt(packet.module) ?? 0;
                const denominator = parseInt(packet.modules) ?? 0;
                const percent = numerator / denominator * 100;

                if (packet.status === 'finished') {
                    if (soFar === times - 1) {
                        progressContainer.hide();
                        toastr.info('TabbyLoader: Model loaded');
                    } else {
                        $('#loading_progressbar').progressbar('value', 0);
                        toastr.info('TabbyLoader: Draft Model loaded');
                    }
                    soFar++;
                } else {
                    $('#loading_progressbar').progressbar('value', Math.round(percent ?? 0));
                }
            }
        } else {
            const responseJson = await response.json();
            console.error('TabbyLoader: Could not load the model because:\n', responseJson?.detail ?? response.statusText);
            toastr.error('TabbyLoader: Could not load the model. Please check the JavaScript or TabbyAPI console for details.');
        }
    } catch (error) {
        console.error('TabbyLoader: Could not load the model because:\n', error);
        toastr.error('Could not load the model. Please check the TabbyAPI console for details.');
    } finally {
        $('#loading_progressbar').progressbar('value', 0);
        $('#loading_progress_container').hide();
    }
}

async function onUnloadModelClick() {
    verifyTabby();
    const tabbyURL = getTabbyURL();

    const authToken = await getTabbyAuth();
    if (!authToken) {
        return;
    }

    const response = await fetch(`${tabbyURL}/v1/model/unload`, {
        method: 'GET',
        headers: {
            'X-admin-key': authToken,
        },
    });

    if (response.ok) {
        toastr.info('TabbyLoader: Model unloaded');
    } else {
        const responseJson = await response.json();
        console.error('TabbyLoader: Could not unload the model because:\n', responseJson?.detail ?? response.statusText);
        toastr.error('Could not unload the model. Please check the JavaScript or TabbyAPI console for details.');
    }
}

async function onParameterEditorClick() {
    const parameterHtml = $(await $.get(`${extensionFolderPath}/modelParameters.html`));
    parameterHtml
        .find('input[name="max_seq_len"]')
        .val(extensionSettings?.modelParams?.maxSeqLen ?? 4096);
    parameterHtml
        .find('input[name="rope_scale"]')
        .val(extensionSettings?.modelParams?.ropeScale ?? 1.0);
    parameterHtml
        .find('input[name="rope_alpha"]')
        .val(extensionSettings?.modelParams?.ropeAlpha ?? 1.0);
    parameterHtml
        .find('input[name="draft_rope_scale"]')
        .val(extensionSettings?.modelParams?.draft?.draft_ropeScale ?? 1.0);
    parameterHtml
        .find('input[name="draft_rope_alpha"]')
        .val(extensionSettings?.modelParams?.draft?.draft_ropeAlpha ?? 1.0);
    parameterHtml
        .find('input[name="no_flash_attention"]')
        .prop('checked', extensionSettings?.modelParams?.noFlashAttention ?? false);
    parameterHtml
        .find('input[name="eight_bit_cache"]')
        .prop('checked', extensionSettings?.modelParams?.eightBitCache ?? false);

    // MARK: GPU split options
    const gpuSplitAuto = extensionSettings?.modelParams?.gpuSplitAuto ?? true;

    const gpuSplitValue = extensionSettings?.modelParams?.gpuSplit;
    const gpuSplitTextbox = parameterHtml
        .find('input[name="gpu_split_value"]')
        .val(JSON.stringify(gpuSplitValue?.length > 0 ? gpuSplitValue : undefined))
        .prop('disabled', gpuSplitAuto);

    parameterHtml
        .find('input[name="gpu_split_auto"]')
        .prop('checked', gpuSplitAuto)
        .on('click', function () {
            gpuSplitTextbox.prop('disabled', $(this).prop('checked'));
        });

    const popupResult = await callPopup(parameterHtml, 'confirm', undefined, { okButton: 'Save' });
    if (popupResult) {
        const newParams = {
            maxSeqLen: parameterHtml.find('input[name="max_seq_len"]').val(),
            ropeScale: parameterHtml.find('input[name="rope_scale"]').val(),
            ropeAlpha: parameterHtml.find('input[name="rope_alpha"]').val(),
            draft: {
                draft_ropeScale: parameterHtml.find('input[name="draft_rope_scale"]').val(),
                draft_ropeAlpha: parameterHtml.find('input[name="draft_rope_alpha"]').val(),
            },
            noFlashAttention: parameterHtml.find('input[name="no_flash_attention"]').prop('checked'),
            gpuSplitAuto: parameterHtml.find('input[name="gpu_split_auto"]').prop('checked'),
            eightBitCache: parameterHtml.find('input[name="eight_bit_cache"]').prop('checked'),
        };

        // Handle GPU split setting
        const gpuSplitVal = parameterHtml.find('input[name="gpu_split_value"]').val();
        try { 
            const gpuSplitArray = JSON.parse(gpuSplitVal) ?? [];
            if (Array.isArray(gpuSplitArray)) {
                newParams['gpuSplit'] = gpuSplitArray;
            } else {
                console.error(`Provided GPU split value (${gpuSplitArray}) is not an array.`);
                newParams['gpuSplit'] = [];
            }
        } catch (error) {
            console.error(error);
            newParams['gpuSplit'] = [];
        }

        Object.assign(extensionSettings, { modelParams: newParams });
        saveSettingsDebounced();
    }
}

async function loadSettings() {
    //Create the settings if they don't exist

    extension_settings[settingsName] = extension_settings[settingsName] || {};
    if (Object.keys(extension_settings[settingsName]).length === 0) {
        Object.assign(extension_settings[settingsName], defaultSettings);
        saveSettingsDebounced();
    }

    $('#tabby_url_override').val(extensionSettings?.urlOverride ?? '');
    $('#tabby_use_proxy').prop('checked', extensionSettings?.useProxy ?? false);

    // Updating settings in the UI
    const placeholder = await getTabbyAuth() ? '✔️ Key found' : '❌ Missing key';
    $('#tabby_admin_key').attr('placeholder', placeholder);
}

// This function is called when the extension is loaded
jQuery(async () => {
    // This is an example of loading HTML from a file
    const settingsHtml = await $.get(`${extensionFolderPath}/dropdown.html`);
    let allmodels = await fetchModels();
    models = allmodels[0]
    draftModels = allmodels[1]

    // Append settingsHtml to extensions_settings
    // extension_settings and extensions_settings2 are the left and right columns of the settings menu
    // Left should be extensions that deal with system functions and right should be visual/UI related
    $('#extensions_settings').append(settingsHtml);

    $('#model_list')
        .autocomplete({
            source: (_, response) => {
                return response(models);
            },
            minLength: 0,
        })
        .focus(function () {
            $(this)
                .autocomplete(
                    'search',
                    $(this).val(),
                );
        });

    $('#draft_model_list')
        .autocomplete({
            source: (_, response) => {
                return response(draftModels);
            },
            minLength: 0,
        })
        .focus(function () {
            $(this)
                .autocomplete(
                    'search',
                    $(this).val(),
                );
        });

    // These are examples of listening for events
    $('#load_model_button').on('click', function () {
        if (verifyTabby()) {
            onLoadModelClick();
        }
    });

    $('#unload_model_button').on('click', function () {
        if (verifyTabby()) {
            onUnloadModelClick();
        }
    });

    $('#reload_model_list_button').on('click', async function () {
        if (verifyTabby()) {
            let allmodels = await fetchModels();
            models = allmodels[0]
            draftModels = allmodels[1]
        }
    });

    $('#tabby_admin_key_clear').on('click', function () {
        localStorage.removeItem('Tabby_Admin');
    });

    $('#tabby_admin_key').on('input', function () {
        const value = $(this).val();
        if (value) {
            localStorage.setItem('Tabby_Admin', value);
        }
    });

    $('#tabby_url_override').on('input', function () {
        const value = $(this).val();
        if (value !== undefined) {
            extensionSettings.urlOverride = value;
            saveSettingsDebounced();
        }
    });

    $('#tabby_use_proxy').on('input', function () {
        extensionSettings.useProxy = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#loading_progressbar').progressbar({
        value: 0,
    });

    $('#loading_progress_container').hide();
    $('#open_parameter_editor').on('click', function () {
        onParameterEditorClick();
    });

    // Load settings when starting things up (if you have any)
    await loadSettings();
});
