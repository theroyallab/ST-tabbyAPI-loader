# TabbyAPI Loader

Load and unload models with [TabbyAPI](https://github.com/theroyallab/tabbyAPI) right from SillyTavern.

## Disclaimer

This extension is not feature complete by any means. However, it does support basic model loading and unloading. Updates will come incrementally as I add more features, so please be patient!

If you want to make a UI for TabbyAPI, please reference the [documentation section](https://github.com/theroyallab/tabbyAPI#api-documentation) of TabbyAPI's README.

## Objective

Bridges the gap for model loading between TabbyAPI and SillyTavern without the need for a third-party UI.

## Features and Planned Features

- ~~Model loading~~

- ~~Model unloading~~

- ~~Configure model parameters~~

- Create config presets that can be applied across models

- ~~Speculative decoding~~

- Lora support

## Prerequisites

SillyTavern must be on the latest staging branch as this extension will receive updates that require newer functions from staging commits.

## Installation and Usage

### Installation

Method 1:

- Add The Royal Lab's extensions repo using the following URL inside SillyTavern:
  
  - [https://raw.githubusercontent.com/theroyallab/ST-repo/main/index.json](https://raw.githubusercontent.com/theroyallab/ST-repo/main/index.json)



Method 2:

- Use SillyTavern's `Install Extension` button and input the URL for this repo. However, you won't get extension updates.

### Usage

Make sure TabbyAPI is selected as your API in SillyTavern or none of the extension's features will work!

Make sure to use an **Admin key** for running load and unload operations! I can't state this enough, an API key *will not* work 

#### Key storage

TabbyAPI admin keys are fundamentally different from API keys. Admin keys give more scopes to the user including model loading and unloading. There are two ways this extension parses an admin key.

It's recommended to use method #1 for ease of use.

1. Set the admin key inside the extension's credential box.
   
   1. This stores the key in your browser's `localStorage`. It is **NOT** recommended to use a private window here as closing the window will delete your key from the browser's cache.

2. Set the admin key inside SillyTavern's API connection screen.
   
   1. Doing this stores the key in your server's secrets. However, to use this key, `allowKeysExposure` must be enabled in your `config.conf` so the extension can find your key.

#### Loading

1. Select your model from the searchbar. There should be an autocomplete popup when you click it.

2. Select the `Load` button. If you get an error, a model may already be loaded and require an unload first.

#### Unloading

1. Select the `Unload` button. If you get an error, it's probably because you don't have a model that's loaded.

#### Checking for errors

Follow toast messages. 

- If a toast tells you to check inside the JavaScript console, access it via `Inspect Element` then head to the console tab. From there, look for any red error lines that start with `TabbyLoader`.

- If an error isn't properly described, check the TabbyAPI console in your terminal. It will most likely have a more detailed description of what went wrong.

## Contributing

If you have issues with the project:

- Describe the issues in detail

- If you have a feature request, please indicate it as such.

If you have a Pull Request

- Describe the pull request in detail, what, and why you are changing something

## Developers and Permissions

Creators/Developers:

- kingbri
