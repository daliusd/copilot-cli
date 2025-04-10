function convertCdataTags(inputString) {
  if (typeof inputString !== 'string') {
    return inputString;
  }

  return inputString.replace(/<__CDATA__>/g, '<![CDATA[').replace(/<\/__CDATA__>/g, ']]');
}

module.exports = {
  convertCdataTags,
};
