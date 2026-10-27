"""Kiwi's built-in Korean correction only: no booth phrase dictionary."""
import sys,json
from pathlib import Path
names=set(json.loads((Path(__file__).parent/"minecraft-names-ko.json").read_text()).values())
from kiwipiepy import Kiwi
kiwi=Kiwi(num_workers=1)
kiwi.tokenize('준비')
for line in sys.stdin:
 request={}
 try:
  request=json.loads(line)
  tokens=kiwi.tokenize(request['text'],typos='basic_with_continual_and_lengthening',normalize_coda=True)
  corrected=kiwi.join([(t.form,t.tag) for t in tokens])
  # A modifier can qualify a following noun. A case particle or adverb
  # cannot be its head; do not flag the tagger's MM mislabel there.
  ambiguous=sorted({t.form for i,t in enumerate(tokens) if t.form in names and t.tag=="MM" and i+1<len(tokens) and tokens[i+1].tag.startswith("N")})
  print(json.dumps({'id':request['id'],'text':corrected,'typoCost':sum(t.typo_cost for t in tokens),'ambiguousNames':ambiguous},ensure_ascii=False),flush=True)
 except Exception as error:
  print(json.dumps({'id':request.get('id'),'error':type(error).__name__}),flush=True)
