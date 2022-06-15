import fs from 'fs/promises';
import path from 'path';
import { AppError, ErrorCode } from './errors';
import { Config, AppConfigManager } from './interfaces';

export class JsonAppConfigManager implements AppConfigManager {
    async getConfig() {
        try {
            return await this.getAppConfig();
        } catch (error) {
            return this.handleJSONConfigError(error);
        }
    }

    private async getAppConfig() {
        const fullPath = this.getFullPathName();
        const jsonData = await this.getDataFromFullPath(fullPath);
        return this.getParsed(jsonData);
    }

    private getFullPathName() {
        const basePath = process.cwd();
        return path.join(basePath, this.getPathName());
    }

    private getPathName() {
        return 'config.json';
    }

    private async getDataFromFullPath(jsonFullPath: string) {
        return fs.readFile(jsonFullPath, { encoding: 'utf-8' });
    }

    private getParsed(jsonData: string): Config {
        return JSON.parse(jsonData);
    }

    private handleJSONConfigError(error: any): never {
        throw new AppError(this.getErrorCode(error));
    }

    private getErrorCode(error: any): ErrorCode {
        if (error.code === 'ENOENT') {
            return ErrorCode.INVALID_FILE_PATH;
        }
        return ErrorCode.UNKNOWN;
    }
}
