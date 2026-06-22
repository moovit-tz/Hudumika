import React from "react";
import Head from "@/layout/head/Head";
import Content from "@/layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  BackTo,
  PreviewCard,
  CodeBlock,
} from "@/components/Component";
import { Row } from "reactstrap";
import MultipleListDnd from "@/components/partials/dnd/MultipleListDnd";
import SingleListDnd from "@/components/partials/dnd/SingleListDnd";
import DragHandleDnd from "@/components/partials/dnd/HandleDnd";

const DndKit = () => {
  return (
    <>
      <Head title="Dnd kit"></Head>
      <Content page="component">
        <BlockHead size="lg" wide="sm">
          <BlockHeadContent>
            <BackTo link="/components" icon="arrow-left">
              Components
            </BackTo>
            <BlockTitle tag="h2" className="fw-normal">
              Dnd kit
            </BlockTitle>
            <BlockDes>
              <p className="lead">
              Dnd kit is a react library that is beautiful and accessible drag and drop for lists
                with. Click{" "}
                <a href="https://dndkit.com/" target="_blank" rel="noreferrer">
                  here
                </a>{" "}
                for examples and documentation.
              </p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Basic Dnd</BlockTitle>
              <BlockDes>We need to move div options between these two containers.</BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Row className="g-gs">
              <MultipleListDnd />
            </Row>
          </PreviewCard>
          <CodeBlock language="jsx">
            {`import React, { useState } from "react";
import { DndContext,
  closestCorners, useSensors, useSensor, PointerSensor, KeyboardSensor, useDroppable
} from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy, useSortable, arrayMove} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

const list = [
  {
    id: "col1", items: [
      { id: "1", text: "You can move these elements between these two containers." },
      { id: "2", text: "Moving them anywhere else isn't quite possible." },
      { id: "3", text: "Anything can be moved around." },
      { id: "4", text: "More interactive use cases lie ahead." },
    ],
  },
  {
    id: "col2", items: [
      {
        id: "5",
        text: "There's also the possibility of moving elements around in the same container, changing their position.",
      },
      { id: "6", text: "This is the default use case. You only need to specify the containers you want to use." },
      { id: "7", text: "Moving elements works just fine. You can still focus them, too. " },
    ],
  },
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

const MultipleListDnd = () => {

  const sensors = [
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  ];

  const [columns, setColumns] = useState(list);

  const findColumn = (unique) => {
    if (!unique) {
      return null;
    }
    
    if (columns.some((c) => c.id === unique)) {
      return columns.find((c) => c.id === unique) ?? null;
    }
    const id = String(unique);
    const itemWithColumnId = columns.flatMap((c) => {
      const columnId = c.id;
      return c.items.map((i) => ({ itemId: i.id, columnId: columnId }));
    });
    const columnId = itemWithColumnId.find((i) => i.itemId === id)?.columnId;
    return columns.find((c) => c.id === columnId) ?? null;
  };

  const handleDragOver = (event) => {
    const { active, over, delta } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return null;
    }
    setColumns((prevState) => {
      const activeItems = activeColumn.items;
      const overItems = overColumn.items;
      const activeIndex = activeItems.findIndex((i) => i.id === activeId);
      const overIndex = overItems.findIndex((i) => i.id === overId);
      const newIndex = () => {
        const putOnBelowLastItem =
          overIndex === overItems.length - 1 && delta.y > 0;
        const modifier = putOnBelowLastItem ? 1 : 0;
        return overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      };
      return prevState.map((c) => {
        if (c.id === activeColumn.id) {
          c.items = activeItems.filter((i) => i.id !== activeId);
          return c;
        } else if (c.id === overColumn.id) {
          c.items = [
            ...overItems.slice(0, newIndex()),
            activeItems[activeIndex],
            ...overItems.slice(newIndex(), overItems.length)
          ];
          return c;
        } else {
          return c;
        }
      });
    });
  };

  const handleDragEnd = (event ) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn !== overColumn) {
      return null;
    }
    const activeIndex = activeColumn.items.findIndex((i) => i.id === activeId);
    const overIndex = overColumn.items.findIndex((i) => i.id === overId);
    if (activeIndex !== overIndex) {
      setColumns((prevState) => {
        return prevState.map((column) => {
          if (column.id === activeColumn.id) {
            column.items = arrayMove(overColumn.items, activeIndex, overIndex);
            return column;
          } else {
            return column;
          }
        });
      });
    }
  };



  const handleDragStart = (event) => {
    const { active } = event;

  };
  

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd} onDragStart={handleDragStart} onDragOver={handleDragOver}>
          {list.map((column, index) => {
            return (
              <div key={index} className="col-lg-6">
                <Column
                  key={column.id}
                  id={column.id}
                  className="card card-bordered p-4 h-100 gap-3"
                >
                  <SortableContext items={column.items} strategy={verticalListSortingStrategy}>
                    {column.items.map((item) => (
                      <Item key={item.id} item={item} className="card card-bordered p-2">
                        {item.text}
                      </Item>
                    ))}
                  </SortableContext>
                </Column>

              </div>
            );
          })}
    </DndContext>
  );
};`}
          </CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Basic Dnd with Single column</BlockTitle>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Row className="g-gs">
              <SingleListDnd />
            </Row>
          </PreviewCard>
          <CodeBlock language="jsx">
            {`import React, { useState } from "react";
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
};`}
          </CodeBlock>
        </Block>

        <Block size="lg">
          <BlockHead>
            <BlockHeadContent>
              <BlockTitle tag="h5">Drag Handle</BlockTitle>
              <BlockDes>
                Drag with <strong>handles</strong> to copy option from one container to another.
              </BlockDes>
            </BlockHeadContent>
          </BlockHead>
          <PreviewCard>
            <Row className="g-gs">
              <DragHandleDnd />
            </Row>
          </PreviewCard>
          <CodeBlock language="jsx">
            {`import React, { useState } from "react";
import { DndContext,
  closestCorners, useSensors, useSensor, PointerSensor, KeyboardSensor, useDroppable
} from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy, useSortable, arrayMove} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

const list = [
  {
    id: "col1", items: [
      { id: "1", text: "You can move these elements between these two containers." },
      { id: "2", text: "Moving them anywhere else isn't quite possible." },
      { id: "3", text: "Anything can be moved around." },
      { id: "4", text: "More interactive use cases lie ahead." },
    ],
  },
  {
    id: "col2", items: [
      {
        id: "5",
        text: "There's also the possibility of moving elements around in the same container, changing their position.",
      },
      { id: "6", text: "This is the default use case. You only need to specify the containers you want to use." },
      { id: "7", text: "Moving elements works just fine. You can still focus them, too. " },
    ],
  },
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
      <div className={className && className} ref={setNodeRef}  {...attributes} style={style}>
      <div className="d-flex gap-2 h-auto">
        <div className="handle" {...listeners} ><em className="ni ni-move"></em></div>
        <div className="fake-class">{children}</div>
      </div>
      </div>
  )
}

const HandleDnd = () => {

  const [columns, setColumns] = useState(list);

  const sensors = [
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  ];


  const findColumn = (unique) => {
    if (!unique) {
      return null;
    }
    
    if (columns.some((c) => c.id === unique)) {
      return columns.find((c) => c.id === unique) ?? null;
    }
    const id = String(unique);
    const itemWithColumnId = columns.flatMap((c) => {
      const columnId = c.id;
      return c.items.map((i) => ({ itemId: i.id, columnId: columnId }));
    });
    const columnId = itemWithColumnId.find((i) => i.itemId === id)?.columnId;
    return columns.find((c) => c.id === columnId) ?? null;
  };

  const handleDragOver = (event) => {
    const { active, over, delta } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return null;
    }
    setColumns((prevState) => {
      const activeItems = activeColumn.items;
      const overItems = overColumn.items;
      const activeIndex = activeItems.findIndex((i) => i.id === activeId);
      const overIndex = overItems.findIndex((i) => i.id === overId);
      const newIndex = () => {
        const putOnBelowLastItem =
          overIndex === overItems.length - 1 && delta.y > 0;
        const modifier = putOnBelowLastItem ? 1 : 0;
        return overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      };
      return prevState.map((c) => {
        if (c.id === activeColumn.id) {
          c.items = activeItems.filter((i) => i.id !== activeId);
          return c;
        } else if (c.id === overColumn.id) {
          c.items = [
            ...overItems.slice(0, newIndex()),
            activeItems[activeIndex],
            ...overItems.slice(newIndex(), overItems.length)
          ];
          return c;
        } else {
          return c;
        }
      });
    });
  };

  const handleDragEnd = (event ) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    const activeColumn = findColumn(activeId);
    const overColumn = findColumn(overId);
    if (!activeColumn || !overColumn || activeColumn !== overColumn) {
      return null;
    }
    const activeIndex = activeColumn.items.findIndex((i) => i.id === activeId);
    const overIndex = overColumn.items.findIndex((i) => i.id === overId);
    if (activeIndex !== overIndex) {
      setColumns((prevState) => {
        return prevState.map((column) => {
          if (column.id === activeColumn.id) {
            column.items = arrayMove(overColumn.items, activeIndex, overIndex);
            return column;
          } else {
            return column;
          }
        });
      });
    }
  };



  const handleDragStart = (event) => {
    const { active } = event;

  };
  

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd} onDragStart={handleDragStart} onDragOver={handleDragOver}>
          {list.map((column, index) => {
            return (
              <div key={index} className="col-lg-6">
                <Column
                  key={column.id}
                  id={column.id}
                  className="card card-bordered p-4 h-100 gap-3"
                >
                  <SortableContext items={column.items} strategy={verticalListSortingStrategy}>
                    {column.items.map((item) => (
                      <Item key={item.id} item={item} className="card card-bordered p-2">
                        {item.text}
                      </Item>
                    ))}
                  </SortableContext>
                </Column>

              </div>
            );
          })}
    </DndContext>
  );
};
`}
          </CodeBlock>
        </Block>
      </Content>
    </>
  );
};

export default DndKit;
