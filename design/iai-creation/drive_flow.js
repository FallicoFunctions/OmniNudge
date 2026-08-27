// Drive the creation flow the way the runtime would: act, then re-render.
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(patch) { this.state = Object.assign({}, this.state, patch); }
}
global.DCLogic = DCLogic;
const Component = require('./flow_logic.js');

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
check('woman -> she', render().title, 'She will not stay this way');
c.setState({ gender: 'man' });
check('man -> he', render().title, 'He will not stay this way');
c.setState({ gender: '' });
check('unanswered -> they, with plural agreement', render().title, 'They will not stay this way');
check('agnostic rail label too', render().rail[2].label, 'Their face');
c.setState({ gender: 'woman' });

// --- the pick limits actually hold ---
const temperaments = render().groups[0].options;
[0, 1, 2, 3].forEach((i) => temperaments[i].pick());
check('a fourth temperament is refused', c.state.temperaments.length, 3);
check('the counter says so', render().groups[0].counter, '3 of 3');
check('and the screen is ready', render().nextDisabled, false);
render().groups[0].options[0].pick();            // deselect
check('deselecting drops back to two', c.state.temperaments.length, 2);
check('which blocks again', render().nextDisabled, true);
check('with a hint saying why', render().hint, 'Choose three to carry on.');
[0].forEach((i) => render().groups[0].options[i].pick());

c.setState({ step: 6 });
const interests = render().groups[0].options;
[0, 1, 2, 3].forEach((i) => interests[i].pick());
check('interests stop at three', c.state.interests.length, 3);
check('but the screen is skippable', make({ start: 6 }).render().nextDisabled, false);

// --- the age slider ---
c.setState({ step: 1 });
render().setAge({ target: { value: '99' } });
check('the top of the slider is a real age', render().ageLabel, '99');
render().setAge({ target: { value: '18' } });
check('and so is the bottom', render().ageLabel, '18');

// --- the name field respects the server cap ---
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
      const need = walk.c.state.step === 5 ? 3 : 1;
      for (let i = 0; i < need; i += 1) walk.render().groups[0].options[i].pick();
    }
    if (walk.render().showName) walk.render().setName({ target: { value: 'Nadia' } });
  }
  walk.render().next();
};
for (let i = 0; i < 8; i += 1) answer();
check('the flow reaches the last screen', walk.c.state.step, 9);
check('the last button is not Continue', walk.render().nextLabel, 'Start talking to her');
const rows = walk.render().reviewRows;
check('the review reports what was chosen', rows.map((r) => r.label),
  ['Look', 'Face', 'Build', 'She starts', 'She is into', 'With you']);
check('a screen nobody answered reads as left open', rows[1].value, 'Left open');
check('the review names her', walk.render().reviewName, 'Nadia');


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
