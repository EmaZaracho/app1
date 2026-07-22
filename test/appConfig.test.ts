import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const easJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));

describe('app.json: versión pública 1.1.0', () => {
  it('expo.version es 1.1.0', () => {
    expect(appJson.expo.version).toBe('1.1.0');
  });

  it('android.versionCode es 2', () => {
    expect(appJson.expo.android.versionCode).toBe(2);
  });

  it('ios.buildNumber es "2"', () => {
    expect(appJson.expo.ios.buildNumber).toBe('2');
  });

  it('runtimeVersion sigue usando la policy appVersion', () => {
    expect(appJson.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('mantiene bundle identifier, package de Android y projectId de EAS sin cambios', () => {
    expect(appJson.expo.ios.bundleIdentifier).toBe('com.emazaracho.app1');
    expect(appJson.expo.android.package).toBe('com.emazaracho.app1');
    expect(appJson.expo.extra.eas.projectId).toBe('b1034252-18e8-42a1-84d7-529ed042a057');
    expect(appJson.expo.updates.url).toBe('https://u.expo.dev/b1034252-18e8-42a1-84d7-529ed042a057');
  });

  it('mantiene el nombre de la base SQLite (App.tsx sigue abriendo expenses.db)', () => {
    const appTsx = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
    expect(appTsx).toContain('databaseName="expenses.db"');
  });
});

describe('eas.json: versión pública bajo control manual', () => {
  it('cli.appVersionSource es local', () => {
    expect(easJson.cli.appVersionSource).toBe('local');
  });

  it('production.autoIncrement sigue activo', () => {
    expect(easJson.build.production.autoIncrement).toBe(true);
  });

  it('mantiene los perfiles preview y production', () => {
    expect(easJson.build.preview).toBeDefined();
    expect(easJson.build.production).toBeDefined();
  });
});

describe('CHANGELOG.md', () => {
  it('existe y documenta 1.1.0', () => {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## 1.1.0');
    expect(changelog).toContain('## 1.0.0');
  });
});
