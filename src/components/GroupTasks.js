import React, { Component } from "react";
import { Icon, Spinner, TextField } from "office-ui-fabric-react";
import { Droppable, DragDropContext } from "react-beautiful-dnd";
import Task from "./Task";
import UserTile from "./UserTile";
import tasksService from "../services/tasks.service";
import * as microsoftTeams from "@microsoft/teams-js";

// A little function to help us with reordering the result
const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

class GroupTasks extends Component {
  constructor(props) {
    super(props);

    const url = new URL(window.location);
    const params = new URLSearchParams(url.search);

    this.state = {
      conversationOpen: false,
      newTask: { title: "" },
      tasks: [],
      inTeams: !!params.get("inTeams")
    };
  }

  componentDidMount() {
    this.setState({ loading: true });

    if (this.state.inTeams) {
      microsoftTeams.initialize();
      microsoftTeams.getContext(context => {
        this.setState({
          threadId: context.teamId || context.chatId
        });

        tasksService.get(this.state.threadId).then(tasks => {
          this.setState({
            tasks: tasks.sort((a, b) => a.order - b.order),
            loading: false
          });
        });
      });
    }
  }

  handleTaskCheckedChange = (task, isChecked) => {
    if (isChecked) {
      tasksService.destroy(task._id, this.state.threadId).then(() => {
        this.setState(prevState => {
          return {
            tasks: prevState.tasks.filter(item => item._id !== task._id)
          };
        });
      });
    }
  };

  handleTaskStarredChange = (task, isStarred) => {
    let newOrder = task.order;
    if (isStarred && this.state.tasks.length > 0) {
      newOrder = this.state.tasks[0].order - 100;
    }
    tasksService
      .update(
        { ...task, order: newOrder, starred: isStarred },
        this.state.threadId
      )
      .then(updatedTask => {
        this.setState(prevState => {
          return {
            tasks: prevState.tasks
              .map(t => (t._id === updatedTask._id ? updatedTask : t))
              .sort((a, b) => a.order - b.order)
          };
        });
      });
  };

  handleOpenConversation = task => {
    if (this.state.inTeams) {
      microsoftTeams.conversations.openConversation({
        conversationId: task.conversationId,
        subEntityId: task._id,
        title: task.title,
        onStartConversation: conversation => {
          if (task._id === conversation.subEntityId) {
            tasksService
              .update(
                { ...task, conversationId: conversation.conversationId },
                this.state.threadId
              )
              .then(updatedTask => {
                this.setState(prevState => {
                  return {
                    tasks: prevState.tasks
                      .map(t => (t._id === updatedTask._id ? updatedTask : t))
                      .sort((a, b) => a.order - b.order)
                  };
                });
              });
          }
        },
        onCloseConversation: () => {
          this.setState({
            tasks: this.state.tasks.map(t => ({
              ...t,
              conversationOpen: false
            }))
          });
        }
      });

      this.setState({
        tasks: this.state.tasks.map(t => ({
          ...t,
          conversationOpen: t._id === task._id
        }))
      });
    }
  };

  handleCloseConversation = task => {
    if (this.state.inTeams) {
      microsoftTeams.conversations.closeConversation();

      this.setState({
        tasks: this.state.tasks.map(t => ({ ...t, conversationOpen: false }))
      });
    }
  };

  handleTextChanged = (event, value) => {
    this.setState({ newTask: { title: value } });
  };

  handleKeyDown = event => {
    if (event.key === "Enter") {
      const tasks = this.state.tasks;
      tasksService
        .create(
          {
            ...this.state.newTask,
            order: tasks.length > 0 ? tasks[0].order + 100 : 100
          },
          this.state.threadId
        )
        .then(task => {
          this.setState(prevState => {
            return {
              newTask: { title: "" },
              tasks: [task, ...prevState.tasks]
            };
          });
        });
    }
  };

  onDragEnd = result => {
    // Dropped outside the list
    if (!result.destination) {
      return;
    }

    const tasks = reorder(
      this.state.tasks,
      result.source.index,
      result.destination.index
    );

    if (tasks.length > 1) {
      const index = result.destination.index;
      const task = tasks[index];
      if (index === 0) {
        task.order = tasks[1].order / 2;
      } else if (index === tasks.length - 1) {
        task.order = tasks[tasks.length - 2].order + 100;
      } else {
        task.order = (tasks[index - 1].order + tasks[index + 1].order) / 2;
      }

      tasksService.update(task, this.state.threadId);

      this.setState({
        tasks
      });
    }
  };

  render() {
    return (
      <div className="App-content">
        <div className="App-header">
          <h1 className="App-header-title">Group Tasks</h1>
          <UserTile history={this.props.history} />
        </div>
        <DragDropContext onDragEnd={this.onDragEnd}>
          <div className="Tasks">
            <div className="Tasks-add">
              <div>
                <Icon className="Tasks-add-icon" iconName="Add" />
              </div>
              <TextField
                className="Tasks-add-textfield"
                placeholder="New Task"
                value={this.state.newTask.title}
                onChange={this.handleTextChanged}
                onKeyDown={this.handleKeyDown}
              />
            </div>
            {this.state.loading ? (
              <Spinner label="Loading tasks..." />
            ) : (
              <Droppable droppableId="tasksDroppable" type="TASK">
                {(provided, snapshot) => (
                  <ul
                    className="Tasks-list"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {this.state.tasks.map((task, index) => (
                      <Task
                        key={task._id}
                        index={index}
                        task={task}
                        inTeams={this.state.inTeams}
                        supportsConversation={true}
                        conversationOpen={this.state.conversationOpen}
                        onCheckedChange={this.handleTaskCheckedChange}
                        onStarredChange={this.handleTaskStarredChange}
                        openConversation={this.handleOpenConversation}
                        closeConversation={this.handleCloseConversation}
                      />
                    ))}
                  </ul>
                )}
              </Droppable>
            )}
          </div>
        </DragDropContext>
      </div>
    );
  }
}

export default GroupTasks;
