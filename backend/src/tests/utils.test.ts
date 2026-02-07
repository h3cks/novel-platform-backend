// backend/src/tests/utils.test.ts
import { sanitizeContent, stripHtml, countWordsFromHtml, excerptFromHtml } from '../utils/text';
import { isEmail, isPasswordValid, isUsernameValid, isValidUrl, stripTags, isDisplayNameValid } from '../utils/validators';


describe('text utils', () => {
  test('sanitizeContent strips disallowed tags and normalizes anchor attributes', () => {
    const html = `<script>alert(1)</script><p>Hello <b>World</b> <a href="http://example.com">link</a></p>`;
    const sanitized = sanitizeContent(html);
    expect(sanitized).toContain('<p>');
    expect(sanitized).toContain('Hello');
    expect(sanitized).toContain('href="http://example.com"');
  });


  test('stripHtml removes tags and collapses whitespace', () => {
    const html = '<p>Hello <b>World</b></p>\n\t';
    const text = stripHtml(html);
    expect(text).toBe('Hello World');
  });


  test('countWordsFromHtml counts words after sanitization', () => {
    const html = '<p>One two three</p>';
    expect(countWordsFromHtml(html)).toBe(3);
  });


  test('excerptFromHtml returns shortened text', () => {
    const html = '<p>' + 'word '.repeat(100) + '</p>';
    const ex = excerptFromHtml(html, 50);
    expect(ex.length).toBeGreaterThanOrEqual(50);
    expect(ex.endsWith('...')).toBe(true);
  });
});


describe('validators', () => {
  test('isEmail', () => {
    expect(isEmail('test@example.com')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
  });


  test('isPasswordValid', () => {
    expect(isPasswordValid('Aa1!aaaa')).toBe(true);
    expect(isPasswordValid('short')).toBe(false);
  });


  test('isUsernameValid', () => {
    expect(isUsernameValid('user_01')).toBe(true);
    expect(isUsernameValid('no spaces')).toBe(false);
  });


  test('isValidUrl', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });


  test('stripTags & isDisplayNameValid', () => {
    expect(stripTags('<b>Hello</b>')).toBe('Hello');
    expect(isDisplayNameValid('Name')).toBe(true);
  });
});