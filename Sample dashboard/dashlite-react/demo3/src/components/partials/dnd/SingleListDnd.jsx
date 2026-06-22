import React, { useState } from "react";
import { DndContext, rectIntersection, useSensors, useSensor, PointerSensor, KeyboardSensor, useDroppable } from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy, useSortable, arrayMove} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

const list = [
  { id: "1", text: "You can move these elements between these two containers." },
  { id: "2", text: "Moving them anywhere else isn't quite possible." },
  { id: "3", text: "Anything can be moved around." },
  { id: "4", text: "More interactive use cases lie ahead." },
];


const Column = ({id, className, children}) => {
  const { setNodeRef } = useDroppable({
      id: id,
  });
  return (
      <div className={className && className} ref={setNodeRef} >{children}</div>
  )
}

const Item = ({item, children, className}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: item.id,
  });

  const style = {
      transition,
      transform: CSS.Translate.toString(transform),
  };

  return (
      <div className={className && className} ref={setNodeRef} {...listeners} {...attributes} style={style}>{children}</div>
  )
}

const SingleListDnd = () => {
  const [data, setData] = useState(list);
  const [overId, setOverId] = useState(null);

  function handleDragEnd(event) {
    const { over, active } = event;

    if (!over) return;

    const itemId = active.id ;
    const newColumn = over.id ;
    setData((items) =>{
        const oldIndex = items.findIndex((item) => item.id === itemId);
        const newIndex = items.findIndex((item) => item.id === newColumn);
        return arrayMove(items, oldIndex, newIndex);
    });
  }


  const sensors = [
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  ];
    
  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
        <div className="col-12">
          <Column
            id="single-column"
            className="card card-bordered p-4 h-100 gap-3"
          >
            <SortableContext items={data} strategy={verticalListSortingStrategy}>
              {data.map((item) => {
                return (
                  <Item
                    className="p-3 bg-white border border-light round-lg"
                    key={item.id}
                    item={item}
                  >
                    {item.text}
                  </Item>
                );
              })}
            </SortableContext>
          </Column>
        </div>
    </DndContext>
  );
};
export default SingleListDnd;