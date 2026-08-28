// Drive the creation flow the way the runtime would: act, then re-render.
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(patch) { this.state = Object.assign({}, this.state, patch); }
}
global.DCLogic = DCLogic;
const Component = require('./flow_logic.js');
// Exported alongside the component so this file is self-contained. It was being
// patched in by hand after every copy, which is a step that silently vanishes.
const nameSuggestions = Component.nameSuggestions;

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures += 1; console.log('!! ' + label + '\n     expected ' + JSON.stringify(expected) + '\n     actual   ' + JSON.stringify(actual)); }
  else console.log('ok ' + label);
};

const make = (props) => {
  const c = new Component(props || {});
  return { c, render: () => c.renderVals() };
};

// --- the flow refuses to move until each screen is answered ---
let { c, render } = make({ start: 1 });
check('screen 1 blocks until gender is answered', render().nextDisabled, true);
check('nothing before the answer says she or he', render().title, 'Who are we making');
render().groups[0].options[0].pick();            // a woman
check('answering unblocks it', render().nextDisabled, false);

// --- pronouns follow the answer, including verb agreement ---
c.setState({ step: 5 });
check('woman -> she', render().title, 'How she starts out');
c.setState({ gender: 'man' });
check('man -> he', render().title, 'How he starts out');
c.setState({ gender: '' });
check('unanswered -> they, with plural agreement', render().title, 'How they start out');
check('the tabs are one word each',
  render().rail.map((r) => r.label),
  ['Basics', 'Look', 'Face', 'Build', 'Traits', 'Interests', 'You', 'Name', 'Them']);
c.setState({ gender: 'woman' });

// --- the pick limits actually hold ---
const temperaments = render().groups[0].options;
[0, 1, 2, 3].forEach((i) => temperaments[i].pick());
check('a fourth temperament is refused', c.state.temperaments.length, 3);
check('the counter says so', render().groups[0].counter, '3 of 3');
check('and the screen is ready', render().nextDisabled, false);
render().groups[0].options[0].pick();            // deselect
check('deselecting drops back to two', c.state.temperaments.length, 2);
check('two is still an answer, because three is a ceiling not a quota', render().nextDisabled, false);
[0, 1].forEach(() => render().groups[0].options.find((o) => o.selected).pick());
check('but none of them is not', render().nextDisabled, true);
check('and it says why, which is the only time this screen says anything',
  render().hint, 'Pick at least one to carry on.');
render().groups[0].options[0].pick();

c.setState({ step: 6 });
const interests = render().groups[0].options;
[0, 1, 2, 3].forEach((i) => interests[i].pick());
check('interests stop at three', c.state.interests.length, 3);
check('but the screen is skippable', make({ start: 6 }).render().nextDisabled, false);

// --- the two sliders on screen one ---
c.setState({ step: 1 });
check('screen one carries both', render().sliders.map((s) => s.label), ['Age', 'Height']);

const age = () => render().sliders[0];
age().onChange({ target: { value: '99' } });
check('the top of the age slider is a real age', age().display, '99');
age().onChange({ target: { value: '18' } });
check('and so is the bottom', age().display, '18');

const height = () => render().sliders[1];
check('height leads in feet and inches', height().display, "5'6\"");
check('and no centimetres beside it', height().secondary, '');
height().onChange({ target: { value: '84' } });
check('the top of the height slider', height().display, "7'0\"");
check('still none at the top', height().secondary, '');
height().onChange({ target: { value: '58' } });
check('the floor is adult short stature', height().display, "4'10\"");
height().onChange({ target: { value: '70' } });

// --- the answers that depend on an earlier answer ---
c.setState({ step: 3 });
check('eighteen traits, not ten',
  (() => { c.setState({ step: 5, gender: 'woman' }); return render().groups[0].options.length; })(), 18);
check('forty interests, not nine',
  (() => { c.setState({ step: 6 }); return render().groups[0].options.length; })(), 40);
check('and they filter as you type',
  (() => { c.setState({ interestSearch: 'co' }); return render().groups[0].options.map((o) => o.label); })(),
  ['Comics', 'Comedy', 'Cooking', 'Coffee']);
check('a chosen interest that does not match is hidden, not shown out of place',
  (() => { c.setState({ interestSearch: '', interests: ['space'] });
           c.setState({ interestSearch: 'co' });
           return render().groups[0].options.some((o) => o.key === 'space'); })(), false);
check('and the counter still reports it, so the slot cannot hide',
  render().groups[0].counter, '1 of 3');
c.setState({ interestSearch: '', interests: [] });

check('the you screen asks two questions',
  (() => { c.setState({ step: 7 }); return render().groups.map((g) => g.label); })(),
  ['How she is with you', 'Drawn to you']);
check('besotted is gone and neutral replaced indifferent',
  render().groups[0].options.map((o) => o.key),
  ['guarded', 'neutral', 'curious', 'fond', 'close', 'devoted']);
check('and attraction is answered separately',
  (() => { render().groups[0].options.find((o) => o.key === 'guarded').pick();
           render().groups[1].options.find((o) => o.key === 'strong').pick();
           return [c.state.feeling, c.state.attraction]; })(), ['guarded', 'strong']);

c.setState({ step: 3 });
check('screen three asks six things now',
  render().groups.map((g) => g.label),
  ['Ethnicity', 'Hair length', 'Hair texture', 'Hair style', 'Hair colour', 'Eyes']);

const shapes = () => render().groups[3].options.map((o) => o.key);
c.setState({ style: 'realistic', gender: 'woman', hairTexture: 'coily' });
check('an afro is offered on coily hair', shapes().includes('afro'), true);
c.setState({ hairTexture: 'straight' });
check('and not on straight hair, drawn as a person', shapes().includes('afro'), false);
c.setState({ style: 'anime' });
check('but anime is not claiming to be a photograph', shapes().includes('afro'), true);
c.setState({ style: 'realistic' });

check('length never rules a shape out',
  (() => { c.setState({ gender: 'man', hairTexture: 'straight', hairLength: 'buzzed' });
           return shapes().includes('man_bun'); })(), true);

// Picking an answer that invalidates a later one clears it, which is what the
// server does with it anyway.
// Straight hair, so the afro is only possible while the character is a drawing.
// On coily hair it survives the switch, correctly, and proves nothing.
c.setState({ step: 3, style: 'anime', gender: 'woman', hairTexture: 'straight' });
render().groups[5].options.find((o) => o.key === 'violet').pick();
check('violet is choosable on anime', c.state.eyes, 'violet');
render().groups[3].options.find((o) => o.key === 'afro').pick();
check('and an afro is too', c.state.hairStyle, 'afro');

c.setState({ step: 2 });
render().styleCards[0].pick();
check('switching to realistic clears the eyes it no longer offers', c.state.eyes, '');
check('and the shape that needed a drawing', c.state.hairStyle, '');

c.setState({ step: 4, gender: 'woman' });
render().groups[0].options.find((o) => o.key === 'curvy').pick();
check('curvy is hers', c.state.build, 'curvy');
c.setState({ step: 1 });
render().groups[0].options.find((o) => o.key === 'man').pick();
check('and answering man clears it, because his set has no curvy', c.state.build, '');
c.setState({ step: 4 });
check("his silhouettes are his own",
  render().groups[0].options.map((o) => o.key),
  ['slim', 'lean', 'average', 'athletic', 'muscular', 'stocky', 'heavy']);

// --- the name field respects the server cap ---
c.setState({ step: 7, ethnicity: 'latino', gender: 'woman', name: '' });
render().next();
check('screen eight arrives with a name already in it', c.state.name.length > 0, true);
const suggested = c.state.name;
render().shuffleName();
check('and the shuffle gives a different one', c.state.name !== suggested, true);
check('which is still one the server would offer',
  nameSuggestions('latino', 'woman').includes(c.state.name), true);

c.setState({ step: 8 });
render().setName({ target: { value: 'x'.repeat(60) } });
check('a name over 40 is cut to 40', c.state.name.length, 40);
check('the counter agrees', render().nameCount, '40 / 40');
render().setName({ target: { value: '   ' } });
check('whitespace is not a name', render().nextDisabled, true);
render().setName({ target: { value: 'Nadia' } });
check('a real name is', render().nextDisabled, false);

// --- the rail only goes back ---
c.setState({ step: 3 });
render().rail[7].jump();                          // screen 8, ahead
check('the rail cannot skip ahead', c.state.step, 3);
render().rail[0].jump();
check('but it can go back', c.state.step, 1);

// --- a full walk, answering only what is required ---
const walk = make({ start: 1 });
const answer = () => {
  const v = walk.render();
  if (v.nextDisabled) {
    if (v.showStyleCards) v.styleCards[0].pick();
    else if (v.groups.length) {
      const need = 1;
      for (let i = 0; i < need; i += 1) walk.render().groups[0].options[i].pick();
    }
    if (walk.render().showName) walk.render().setName({ target: { value: 'Nadia' } });
  }
  walk.render().next();
};
for (let i = 0; i < 8; i += 1) answer();
check('the flow reaches the last screen', walk.c.state.step, 9);
check('the review is where she is made, not the screen before it',
  walk.render().nextLabel, 'Make her');
const rows = walk.render().reviewRows;
check('the review reports every answer', rows.map((r) => r.label),
  ['Look', 'Ethnicity', 'Hair', 'Eyes', 'Build', 'She starts', 'She likes', 'With you', 'Drawn to you']);
check('the height has no centimetres beside it', rows[0].value.includes("5'6\""), true);
check('and none anywhere on the screen', JSON.stringify(walk.render()).includes(' cm'), false);
check('a screen nobody answered reads as left open', rows[1].value, 'Left open');
check('the review names her, from the name the flow offered',
  nameSuggestions('', 'woman').includes(walk.render().reviewName), true);

// Buzzed sides with a bun on top: the combination the old model refused.
const buzzed = make({ start: 9 });
buzzed.c.setState({ style: 'realistic', gender: 'man', age: 34, heightInches: 70,
  hairLength: 'buzzed', hairTexture: 'coily', hairStyle: 'man_bun', hairColour: 'dark_brown' });
check('a bun above a buzz cut survives to the review',
  buzzed.render().reviewRows[2].value, 'Buzzed · Coily · Man bun · Dark brown');


// --- the pinned screens, which are what actually gets reviewed ---
const pinned8 = new Component({ start: 8, gender: 'woman' });
check('a screen opened straight onto the name is not blank', pinned8.state.name.length > 0, true);
check('and it is a name the flow would have offered',
  nameSuggestions('', 'woman').includes(pinned8.state.name), true);
check('the same one every time, so two people review the same screen',
  new Component({ start: 8, gender: 'woman' }).state.name, pinned8.state.name);
check('earlier screens are still blank, because nothing has been suggested yet',
  new Component({ start: 1 }).state.name, '');

// --- no screen may use a pronoun the creator did not choose ---
const CSSISH = /style|columns|Colour|figure|plate|Style/;
const visible = (node, key) => {
  if (typeof node === 'string') {
    if (key && CSSISH.test(key)) return [];
    if (/[;:]\s|px|rgba?\(|#[0-9a-f]{3}/i.test(node)) return [];
    return [node];
  }
  if (Array.isArray(node)) return node.flatMap((child) => visible(child, key));
  if (node && typeof node === 'object') {
    return Object.keys(node).flatMap((k) => visible(node[k], k));
  }
  return [];
};

const wrong = { man: /\b(she|her|hers)\b/i, woman: /\b(he|him|his)\b/i };
let leaks = 0;
['woman', 'man'].forEach((gender) => {
  for (let step = 1; step <= 9; step += 1) {
    const probe = new Component({ start: step, gender: gender });
    probe.setState({ temperaments: ['warm', 'dry', 'quiet'], interests: ['games'], feeling: 'fond', name: 'Nadia', style: 'realistic' });
    visible(probe.renderVals()).forEach((text) => {
      if (wrong[gender].test(text)) { leaks += 1; console.log('!! step ' + step + ' as a ' + gender + ': ' + JSON.stringify(text)); }
    });
  }
});
console.log(leaks ? '!! ' + leaks + ' strings use the wrong pronoun' : 'ok every visible string on all 9 screens matches the answer, both ways');
failures += leaks;

console.log('\n' + (failures ? failures + ' FAILURES' : 'all checks passed'));
process.exit(failures ? 1 : 0);
