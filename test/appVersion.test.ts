import { formatVersionInfo } from '../src/services/appVersion';

describe('formatVersionInfo', () => {
  it('usa los valores nativos cuando están disponibles', () => {
    expect(formatVersionInfo('1.1.0', '2')).toEqual({ version: '1.1.0', build: '2' });
  });

  it('cae a la versión configurada cuando nativeApplicationVersion es null (Expo Go)', () => {
    expect(formatVersionInfo(null, '2').version).toBe('1.1.0');
  });

  it('muestra "No disponible" cuando nativeBuildVersion es null', () => {
    expect(formatVersionInfo('1.1.0', null).build).toBe('No disponible');
  });

  it('nunca expone updateId ni otros identificadores internos', () => {
    const info = formatVersionInfo('1.1.0', '2');
    expect(Object.keys(info).sort()).toEqual(['build', 'version']);
  });
});
