// What a chat widget is built from (VeraChat.ets): the marker's plain request, else the description, else the message; a revision is
// no replacement to build.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const chat = loadVera('VeraChat')
const {WidgetBuildContext} = loadVera('VeraWidgetContext')
const {settings} = loadVera('SettingsStore')
const compose = loadVera('VeraCompose')

settings.hasSelectorKey = () => true
const context = fields => Object.assign(new WidgetBuildContext(), fields)
const agent = c => chat.chatAgentRequest(c) && chat.chatAgentRequest(c).prompt

// The marker's plain request first, then the description, then the message.
assert.equal(agent(context({request: ' tip calculator ', brief: 'a long description', currentRequest: 'the message'})), 'tip calculator')
assert.equal(agent(context({request: '', brief: 'a long description', currentRequest: 'the message'})), 'a long description')
assert.equal(agent(context({request: '  ', brief: ' ', currentRequest: ' the message '})), 'the message')
// A revision of an existing widget is no replacement to build.
assert.equal(chat.chatAgentRequest(context({request: 'tip calculator', source: 'import ...'})), null)
// A widget built on search results is not the agent's.
assert.equal(chat.chatAgentRequest(context({request: 'weather', verifiedSearchResults: ['x']})), null)
assert.equal(chat.chatAgentRequest(context({request: 'tip calculator'})).widget, true)
console.log('chat-prompt-check: ok')
