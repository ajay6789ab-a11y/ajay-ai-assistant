import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../providers/assistant_provider.dart';
import '../widgets/common.dart';
import '../widgets/message_bubble.dart';

/// Chat: the full conversation with voice *and* text input.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 120,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _submit(AssistantProvider assistant) {
    final String text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    assistant.send(text);
    _scrollToEnd();
  }

  @override
  Widget build(BuildContext context) {
    final AssistantProvider assistant = context.watch<AssistantProvider>();
    _scrollToEnd();

    return SafeArea(
      child: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 10),
            child: ScreenTitle(
              'Conversation',
              subtitle: 'Ajay remembers the context of your chat',
              trailing: StatusPill(
                label: assistant.engine == 'llm' ? 'GPT' : 'on-device',
                color: assistant.engine == 'llm' ? AppColors.ok : AppColors.amber,
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              itemCount: assistant.messages.length + (assistant.isBusy ? 1 : 0),
              itemBuilder: (BuildContext context, int i) {
                if (i >= assistant.messages.length) return const _TypingIndicator();
                return MessageBubble(message: assistant.messages[i]);
              },
            ),
          ),
          _Composer(
            controller: _input,
            listening: assistant.isListening,
            onMic: assistant.toggleListening,
            onSend: () => _submit(assistant),
          ),
        ],
      ),
    );
  }
}

/// "Ajay is typing" three-dot indicator.
class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14, left: 37),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.stroke),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(18),
              topRight: Radius.circular(18),
              bottomRight: Radius.circular(18),
              bottomLeft: Radius.circular(6),
            ),
          ),
          child: AnimatedBuilder(
            animation: _c,
            builder: (BuildContext context, _) => Row(
              mainAxisSize: MainAxisSize.min,
              children: List<Widget>.generate(3, (int i) {
                final double v = ((_c.value + i * 0.18) % 1);
                final double lift = v < 0.3 ? v / 0.3 : 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.5),
                  child: Transform.translate(
                    offset: Offset(0, -3 * lift),
                    child: Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: AppColors.violet.withOpacity(0.25 + 0.75 * lift),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

/// Input bar: mic toggle + text field + send.
class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.listening,
    required this.onMic,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool listening;
  final VoidCallback onMic;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: 12 + MediaQuery.of(context).viewInsets.bottom * 0.02,
      ),
      child: Row(
        children: <Widget>[
          GestureDetector(
            onTap: onMic,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: listening ? AppColors.primaryGradient : null,
                color: listening ? null : AppColors.surface2,
                border: Border.all(color: AppColors.stroke),
              ),
              child: Icon(
                listening ? Icons.stop_rounded : Icons.mic_rounded,
                size: 19,
                color: listening ? AppColors.bg0 : AppColors.text,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              style: const TextStyle(fontSize: 14),
              decoration: const InputDecoration(hintText: 'Message or speak to Ajay…'),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onSend,
            child: Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: AppColors.primaryGradient,
              ),
              child: const Icon(Icons.arrow_forward_rounded, size: 20, color: AppColors.bg0),
            ),
          ),
        ],
      ),
    );
  }
}
