import de from './de.json';
import en from './en.json';
import tr from './tr.json';

function leafKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? leafKeys(child, path) : [path];
  });
}

describe('locale catalogs', () => {
  test('German, English, and Turkish have identical leaf-key coverage', () => {
    const expected = leafKeys(de).sort();
    expect(leafKeys(en).sort()).toEqual(expected);
    expect(leafKeys(tr).sort()).toEqual(expected);
  });

  test('all translated leaves contain displayable strings', () => {
    [de, en, tr].forEach(catalog => {
      leafKeys(catalog).forEach(key => {
        const value = key.split('.').reduce((current, part) => current[part], catalog);
        expect(typeof value).toBe('string');
        if (key !== 'common.timeSuffix') expect(value.trim()).not.toBe('');
      });
    });
  });
});
