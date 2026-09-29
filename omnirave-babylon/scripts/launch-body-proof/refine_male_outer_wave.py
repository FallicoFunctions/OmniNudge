"""Release the outer swept front into a loose, visible wave."""
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth


def release_outer_wave(mapping,report,apply_geometry):
    ob=bpy.data.objects['Luxury retained swept groom']
    source=array(ob);cards=source.reshape(-1,12,2,3);out=cards.copy()
    t=np.linspace(0,1,12)
    free=smooth((t-t[2])/.40)
    belly=np.sin(np.pi*t)*free
    late=smooth((t-.38)/.62)
    changed=0;max_move=0.0
    for i,card in enumerate(cards):
        path=card.mean(1);tip=path[-1]
        outer=float(smooth((-.055-tip[0])/.023))
        face=float(smooth((-tip[1]-.095)/.042))
        high=float(smooth((tip[2]-1.704)/.050))*float(1-smooth((tip[2]-1.787)/.018))
        weight=outer*face*high
        if weight<.015:continue
        center=path.copy()
        center[:,0]-=weight*(.012*belly+.024*late)
        center[:,1]-=weight*(.006*belly+.010*late)
        center[:,2]+=weight*(.014*belly-.004*late)
        center[:,0]+=weight*.006*smooth((t-.80)/.20)
        center[:3]=path[:3]
        half=(card[:,1]-card[:,0])*.5
        result=np.stack([center-half,center+half],axis=1)
        result[:3]=card[:3]
        out[i]=result
        max_move=max(max_move,float(np.linalg.norm(result-card,axis=2).max()))
        changed+=1
    apply_geometry(ob,out.reshape(-1,3),mapping,report)
    details={'editedRibbons':changed,'maxDisplacementMm':max_move*1000,'fixedRootPairs':3}
    report[ob.name]['outerWave']=details
    return details
