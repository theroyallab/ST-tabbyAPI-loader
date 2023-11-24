import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { api_server_textgenerationwebui, callPopup, online_status, saveSettingsDebounced } from "../../../../script.js";
import { isTabby } from "../../../textgen-settings.js";
import { findSecret } from "../../../secrets.js";

const extensionName = "ST-tabbyAPI-loader";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {};

// Cached models list
let models = [];

// TODO: Needed for later
// Loads the extension settings if they exist, otherwise initializes them to the defaults.
/*
async function loadSettings() {
    //Create the settings if they don't exist

    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Updating settings in the UI
    $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
}
*/
// const popupResult = await callPopup(editorHtml, "confirm", undefined, { okButton: "Save" });

// Check if user is connected to TabbyAPI
function verifyTabby(logError = true) {
    const result = online_status !== "no_connection" || isTabby();
    if (!result && logError) {
        toastr.error("Tabby Loader: Please connect to a TabbyAPI instance to use this extension.");
    }

    return result;
}

// Fetch a cleaned URL
function getTabbyURL() {
    return api_server_textgenerationwebui.replace(/\/$/, "");
}

// Fetch the TabbyAPI admin key if present
// TODO: Add check to see if the key has admin permissions
async function getTabbyAuth() {
    // In localStorage? Return it.
    let authToken = localStorage.getItem("Tabby_Admin");

    // Not in localStorage? Try secrets
    if (!authToken) {
        console.warn("TabbyLoader: Could not find your TabbyAPI admin key in localStorage, attempting to fetch from secrets...");

        try {
            authToken = await findSecret("api_key_tabby");
        } catch (error) {
            console.error(`TabbyLoader: ${error}`);
            console.error("Please make sure allowKeysExposure is true in config.conf and an API key is set for TabbyAPI.");
        }
    }

    // If a failure on both fronts
    if (!authToken) {
        console.error(
            "TabbyLoader: Admin key not found.",
            "Please make sure allowKeysExposure is true in config.conf if fetching from secrets."
        );
    }

    return authToken
}

// Fetch the model list for autocomplete population
async function fetchModels() {
    if (!verifyTabby(false)) {
        console.error("TabbyLoader: Could not connect to TabbyAPI.");
        return
    }

    // Remove trailing URL slash
    const apiUrl = getTabbyURL()

    try {
        const authToken = await getTabbyAuth();
        if (!authToken) {
            return;
        }

        const response = await fetch(`${apiUrl}/v1/model/list`, {
            headers: {
                // TODO: Add auth get routes
                "Authorization": `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const models = await response.json()

            return models.data.map((e) => e.id)
        } else {
            console.error(`Request to /v1/model/list failed with a statuscode of ${response.status}:\n${response.statusText}`)

            return []
        }
    } catch (error) {
        console.error(error)

        return []
    }
}

// This function is called when the button is clicked
async function onLoadModelClick() {
    if (!isTabby()) {
        toastr.error("This function is only useable when TabbyAPI is selected. Please select TabbyAPI as your SillyTavern API.");

        return;
    }

    const modelValue = $("#model_list").val()

    if (!modelValue) {
        // TODO: Fire an error here
        return
    }

    // const loaderHtml = $(await $.get(`${extensionFolderPath}/test.html`));
    const tabbyURL = getTabbyURL()

    const body = {
        name: modelValue
    }

    const authToken = await getTabbyAuth();
    if (!authToken) {
        return;
    }

    const response = await fetch(`${tabbyURL}/v1/model/load`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        console.log("Load recieved: ", decoder.decode(value));
    }

    // const popupResult = await callPopup(loaderHtml, "confirm", undefined, { okButton: "Ok" });
}

async function onUnloadModelClick() {
    verifyTabby();
    const tabbyURL = getTabbyURL();

    const authToken = await getTabbyAuth();
    if (!authToken) {
        return;
    }

    const response = await fetch(`${tabbyURL}/v1/model/unload`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        console.log("Model unloaded.");
    }
}

// This function is called when the extension is loaded
jQuery(async () => {
    // This is an example of loading HTML from a file
    const settingsHtml = await $.get(`${extensionFolderPath}/dropdown.html`);
    models = await fetchModels()

    // Append settingsHtml to extensions_settings
    // extension_settings and extensions_settings2 are the left and right columns of the settings menu
    // Left should be extensions that deal with system functions and right should be visual/UI related 
    $("#extensions_settings").append(settingsHtml);

    $("#model_list")
        .autocomplete({
            source: (_, response) => {
                return response(models)
            },
            minLength: 0,
        })
        .focus(function() {
            $(this)
                .autocomplete(
                    'search',
                    $(this).val()
                );
        });

    // These are examples of listening for events
    $("#load_model_button").on("click", function () {
        onLoadModelClick();
    });

    $("#unload_model_button").on("click", function () {
        onUnloadModelClick();
    });

    $("#reload_model_list_button").on("click", async function () {
        models = await fetchModels();
    });

    $("#admin_key_tabby_ext_clear").on("click", function () {
        localStorage.removeItem("Tabby_Admin");
    });

    const placeholder = await getTabbyAuth() ? '✔️ Key found' : '❌ Missing key';
    $("#admin_key_tabby_ext").attr("placeholder", placeholder);
    $("#admin_key_tabby_ext").on("input", function () {
        const value = $(this).val();
        localStorage.setItem("Tabby_Admin", value);
    });

    // Load settings when starting things up (if you have any)
    // loadSettings();
});
