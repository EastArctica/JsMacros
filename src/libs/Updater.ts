import { Endpoints } from '@octokit/types';
import Config from './Config';
import ChatHelper from './ChatHelper';

const CONFIG_ID = 'updater';

type GetReleasesResponse = Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']['data'];

function getLatestReleaseInfo(repo: string) {
    const req = Request.get(`https://api.github.com/repos/${repo}/releases/latest`);
    if (req.responseCode !== 200) return;

    const res = JSON.parse(req.text()) as GetReleasesResponse;
    return res;
}

function getMetadata(release: GetReleasesResponse) {
    const metadataAsset = release.assets.find((asset) => asset.name === 'metadata.json');
    if (!metadataAsset) return;

    const metadataUrl = release.assets[1].browser_download_url;
    const req = Request.get(metadataUrl);
    if (req.responseCode !== 200) return;

    return JSON.parse(req.text());
}

// Returns whether the script was updated
export function updateScript(path: string, repo: string, configPath: string): boolean {
    const scriptFile = path.split('\\').pop();
    const scriptName = scriptFile.split('.')[0];
    const latestRelease = getLatestReleaseInfo(repo);
    if (!latestRelease) {
        ChatHelper.error('[Updater] Failed to get latest release info');
        return false;
    }

    const metadata = getMetadata(latestRelease);
    if (!metadata) {
        ChatHelper.error('[Updater] Failed to get metadata');
        return false;
    }
    if (!metadata[scriptName]) {
        ChatHelper.error('[Updater] Metadata does not contain script info');
        return false;
    }
    const latestVersion = metadata[scriptName].version;

    const config = Config.readConfig(
        configPath,
        {
            [scriptName]: {
                version: '0.0.0',
            },
        },
        CONFIG_ID
    );
    const currentVersion = config[scriptName].version;
    if (currentVersion === latestVersion) return;

    const asset = latestRelease.assets.find((asset) => asset.name === scriptFile);
    if (!asset) {
        ChatHelper.error('[Updater] Failed to find script asset');
        return false;
    }

    const req = Request.get(asset.browser_download_url);
    if (req.responseCode !== 200) {
        ChatHelper.error('[Updater] Failed to download the latest version');
        return false;
    }

    const newScript = req.text();
    FS.open(path).write(newScript);

    ChatHelper.success(`[Updater] Updated ${scriptName} from ${currentVersion || 'unknown'} to ${latestVersion}`);

    config[scriptName].version = latestVersion;
    Config.writeConfig(configPath, config, CONFIG_ID);

    return true;
}
